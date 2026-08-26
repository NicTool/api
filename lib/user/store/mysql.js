import Mysql from '../../mysql.js'
import Config from '../../config.js'
import Credentials from '../credentials.js'
import UserBase from './base.js'
import Permission from '../../permission/index.js'
import { mapToDbColumn } from '../../util.js'
import { splitQualifiedUsername } from '../qualified.js'

const userDbMap = { id: 'nt_user_id', gid: 'nt_group_id' }
const boolFields = ['is_admin', 'deleted']

class UserRepoMySQL extends UserBase {
  constructor(args = {}) {
    super(args)
    this.cfg = Config.getSync('http')
    this.mysql = Mysql
  }

  async authenticate(authTry) {
    const { username, groupName } = splitQualifiedUsername(authTry.username, this.cfg.group ?? 'NicTool')

    const query = `SELECT u.nt_user_id AS id
      , u.nt_group_id
      , u.first_name
      , u.last_name
      , u.username
      , u.password
      , u.pass_salt
      , u.email
    /*, u.is_admin */
      , g.name AS group_name
    FROM nt_user u, nt_group g
    WHERE u.nt_group_id = g.nt_group_id
      AND g.deleted=0
      AND u.deleted=0
      AND u.username = ?
      AND g.name = ?`

    for (const u of await Mysql.execute(query, [username, groupName])) {
      const { valid, needsUpgrade } = await Credentials.validPassword(
        authTry.password,
        u.password,
        authTry.username,
        u.pass_salt,
      )
      if (valid) {
        // best effort: a failed rewrite must not cost the user their login,
        // they simply get upgraded on a later attempt
        if (needsUpgrade) {
          try {
            const creds = await Credentials.forStorage(authTry.password)
            await Mysql.execute(...Mysql.update('nt_user', `nt_user_id=${u.id}`, creds))
          } catch (err) {
            console.warn(`password hash upgrade failed for user ${authTry.username}`, err)
          }
        }
        for (const f of ['password', 'pass_salt']) {
          delete u[f] // SECURITY: no longer needed
        }
        for (const b of ['is_admin']) {
          if (u[b] !== undefined) u[b] = u[b] === 1 // int to boolean
        }
        const g = {
          id: u.nt_group_id,
          name: groupName,
        }
        delete u.nt_group_id
        delete u.group_name
        return { user: u, group: g }
      }
    }
  }

  async create(args) {
    if (args.id) {
      const u = await this.get({ id: args.id })
      if (u.length === 1) return u[0].id
    }

    args = JSON.parse(JSON.stringify(args))

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    if (args.password) {
      Object.assign(args, await Credentials.forStorage(args.password, args.pass_salt))
    }

    const userId = await Mysql.execute(...Mysql.insert(`nt_user`, mapToDbColumn(args, userDbMap)))

    // 5. Explicit Permission Management (Create nt_perm if not inheriting)
    if (userId && inherit === false) {
      await Permission.create({
        uid: userId,
        gid: args.gid,
        inherit: false,
        name: `User ${args.username} perms`,
      })
    }

    return userId
  }

  async get(args) {
    const origDeleted = args.deleted // capture before defaulting/removing
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const include_subgroups = args.include_subgroups === true
    delete args.include_subgroups

    const search = typeof args.search === 'string' ? args.search.trim() : ''
    delete args.search
    const exactMatch = args.exact_match === true
    delete args.exact_match

    const sortByMap = {
      id: 'u.nt_user_id',
      username: 'u.username',
      email: 'u.email',
      first_name: 'u.first_name',
      last_name: 'u.last_name',
      group_name: 'g.name',
    }
    const sortBy = sortByMap[args.sort_by] ?? 'username'
    const sortDir = args.sort_dir === 'desc' ? 'DESC' : 'ASC'
    delete args.sort_by
    delete args.sort_dir

    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : undefined
    delete args.limit
    const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0
    delete args.offset

    let query = `SELECT u.email
      , u.first_name
      , u.last_name
      , u.nt_group_id AS gid
      , u.nt_user_id AS id
      , u.username
      , u.deleted
      , g.name AS group_name
     FROM nt_user u
     JOIN nt_group g ON g.nt_group_id = u.nt_group_id`

    const params = []
    const where = []

    // Recursive Subgroup Listing
    if (args.gid) {
      if (include_subgroups) {
        const subgroupRows = await Mysql.execute(
          'SELECT nt_subgroup_id FROM nt_group_subgroups WHERE nt_group_id = ?',
          [args.gid],
        )
        const gids = [args.gid, ...subgroupRows.map((r) => r.nt_subgroup_id)]
        where.push(`u.nt_group_id IN (${gids.join(',')})`)
      } else {
        where.push('u.nt_group_id = ?')
        params.push(args.gid)
      }
      delete args.gid
    }

    if (args.id) {
      where.push('u.nt_user_id = ?')
      params.push(args.id)
      delete args.id
    }

    if (args.username) {
      where.push('u.username = ?')
      params.push(args.username)
      delete args.username
    }

    if (args.deleted !== undefined) {
      where.push('u.deleted = ?')
      params.push(args.deleted === true ? 1 : 0)
      delete args.deleted
    }

    if (search) {
      where.push(`u.username ${exactMatch ? '=' : 'LIKE'} ?`)
      params.push(exactMatch ? search : `%${search}%`)
    }

    if (where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`
    }

    query += ` ORDER BY ${sortBy} ${sortDir}`
    if (limit !== undefined) query += ` LIMIT ${limit} OFFSET ${offset}`

    const rows = await Mysql.execute(query, params)
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
      if ([false, undefined].includes(origDeleted)) delete r.deleted

      const effectivePerm = await Permission.getEffective(r.id)
      if (effectivePerm) {
        r.permissions = effectivePerm
        r.inherit_group_permissions = effectivePerm.inherit !== false
      }
    }
    return rows
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const includeSubgroups = args.include_subgroups === true
    delete args.include_subgroups

    const params = []
    const where = []

    const search = typeof args.search === 'string' ? args.search.trim() : ''
    const exactMatch = args.exact_match === true

    if (args.id !== undefined) {
      where.push('nt_user_id = ?')
      params.push(args.id)
    }
    if (args.gid !== undefined) {
      if (includeSubgroups) {
        const subgroupRows = await Mysql.execute(
          'SELECT nt_subgroup_id FROM nt_group_subgroups WHERE nt_group_id = ?',
          [args.gid],
        )
        const gids = [args.gid, ...subgroupRows.map((r) => r.nt_subgroup_id)]
        where.push(`nt_group_id IN (${gids.map(() => '?').join(',')})`)
        params.push(...gids)
      } else {
        where.push('nt_group_id = ?')
        params.push(args.gid)
      }
    }
    if (args.username !== undefined) {
      where.push('username = ?')
      params.push(args.username)
    }
    if (args.deleted !== undefined) {
      where.push('deleted = ?')
      params.push(args.deleted === true ? 1 : 0)
    }
    if (search) {
      where.push(`username ${exactMatch ? '=' : 'LIKE'} ?`)
      params.push(exactMatch ? search : `%${search}%`)
    }

    let query = 'SELECT COUNT(*) AS count FROM nt_user'
    if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`

    const rows = await Mysql.execute(query, params)
    return rows[0].count
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id

    // Explicit Permission Management
    if (args.inherit_group_permissions !== undefined) {
      const inherit = args.inherit_group_permissions
      delete args.inherit_group_permissions

      const userPerm = await Permission.get({ uid: id })
      if (inherit === true && userPerm) {
        // Switch to inherited: delete explicit perms
        await Permission.destroy({ id: userPerm.id })
      } else if (inherit === false && !userPerm) {
        // Switch to explicit: create nt_perm entry
        const [userData] = await this.get({ id })
        await Permission.create({
          uid: id,
          gid: userData.gid,
          inherit: false,
          name: `User ${userData.username} perms`,
        })
      } else if (inherit === false && userPerm) {
        // Stay explicit, ensure inherit is false
        await Permission.put({ id: userPerm.id, inherit: false })
      }
    }

    if (Object.keys(args).length === 0) return true

    const userArgs = mapToDbColumn(args, userDbMap)
    if (args.gid === undefined) {
      const r = await Mysql.execute(...Mysql.update(`nt_user`, `nt_user_id=${id}`, userArgs))
      return r.changedRows === 1
    }

    return Mysql.transaction(async (tx) => {
      const r = await tx.execute(...tx.update(`nt_user`, `nt_user_id=${id}`, userArgs))
      await tx.execute('UPDATE nt_perm SET nt_group_id = ? WHERE nt_user_id = ? AND deleted = 0', [
        args.gid,
        id,
      ])
      return r.changedRows === 1
    })
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.update(`nt_user`, `nt_user_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(...Mysql.delete(`nt_user`, mapToDbColumn({ id: args.id }, userDbMap)))
    return r.affectedRows === 1
  }

  disconnect() {
    return this.mysql?.disconnect()
  }
}

export default UserRepoMySQL
