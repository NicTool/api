import { createHash } from 'node:crypto'

import Mysql from '../../mysql.js'
import Config from '../../config.js'
import Credentials from '../credentials.js'
import UserBase, { missingGroup, usernameConflict } from './base.js'
import Permission from '../../permission/index.js'
import { idConflict } from '../../store/error.js'
import { mapToDbColumn } from '../../util.js'
import { splitQualifiedUsername } from '../qualified.js'

const userDbMap = { id: 'nt_user_id', gid: 'nt_group_id' }
const boolFields = ['is_admin', 'deleted']
const nullableFields = ['first_name', 'last_name']

function isLive(deleted) {
  return !(deleted === true || deleted === 1)
}

// GET_LOCK serialises writers of one username@groupname, which a transaction can't.
// MySQL compares names without trailing spaces, so the lock key drops them too.
export async function lockGroupName(tx, name) {
  let end = name.length
  while (end > 0 && name[end - 1] === ' ') end--
  const key = `ntg:${createHash('sha256').update(name.slice(0, end)).digest('hex').slice(0, 60)}`
  const [lock] = await tx.execute('SELECT GET_LOCK(?, 10) AS acquired', [key])
  if (lock.acquired !== 1) throw new Error(`could not lock group name ${name}`)
}

async function lockedGroup(tx, gid) {
  if (gid === undefined) throw missingGroup(gid)
  const [group] = await tx.execute(
    'SELECT name, deleted FROM nt_group WHERE nt_group_id = ? LOCK IN SHARE MODE',
    [gid],
  )
  if (!group) throw missingGroup(gid)
  return group
}

async function assertUsernameAvailable(tx, username, gid, excludeId) {
  const group = await lockedGroup(tx, gid)
  await lockGroupName(tx, group.name)

  let query = `SELECT u.nt_user_id FROM nt_user u
    JOIN nt_group g ON g.nt_group_id = u.nt_group_id
    WHERE u.deleted = 0 AND u.username = ?
      AND (u.nt_group_id = ? OR (? = 0 AND g.deleted = 0 AND g.name = ?))`
  const params = [username, gid, group.deleted, group.name]
  if (excludeId !== undefined) {
    query += ' AND u.nt_user_id <> ?'
    params.push(excludeId)
  }
  if ((await tx.execute(`${query} LIMIT 1`, params)).length > 0) throw usernameConflict(username, group.name)
}

// a group taking a name must not bring a username that name's other groups hold
export async function assertGroupNameAvailable(tx, gid, name) {
  await lockGroupName(tx, name)
  const [clash] = await tx.execute(
    `SELECT u.username FROM nt_user u
      JOIN nt_user o ON o.username = u.username AND o.deleted = 0 AND o.nt_user_id <> u.nt_user_id
      JOIN nt_group g ON g.nt_group_id = o.nt_group_id
      WHERE u.nt_group_id = ? AND u.deleted = 0 AND (g.nt_group_id = ? OR (g.deleted = 0 AND g.name = ?))
      LIMIT 1`,
    [gid, gid, name],
  )
  if (clash) throw usernameConflict(clash.username, name)
}

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
            await Mysql.execute(...Mysql.update('nt_user', { nt_user_id: u.id }, creds))
          } catch (err) {
            console.warn('password hash upgrade failed for user %s', authTry.username, err)
          }
        }
        for (const f of ['password', 'pass_salt']) {
          delete u[f] // SECURITY: no longer needed
        }
        for (const b of ['is_admin']) {
          if (u[b] !== undefined) u[b] = u[b] === 1 // int to boolean
        }
        for (const f of nullableFields) if (u[f] === null) delete u[f]
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

  async isAdmin(id) {
    const [row] = await Mysql.execute(
      `SELECT u.is_admin FROM nt_user u JOIN nt_group g ON g.nt_group_id = u.nt_group_id
        WHERE u.nt_user_id = ? AND u.deleted = 0 AND g.deleted = 0`,
      [id],
    )
    return row?.is_admin === 1
  }

  async checkPassword({ id, password }) {
    const [u] = await Mysql.execute(
      'SELECT username, password, pass_salt FROM nt_user WHERE nt_user_id = ?',
      [id],
    )
    if (!u) return undefined
    return (await Credentials.validPassword(password, u.password, u.username, u.pass_salt)).valid
  }

  async create(args, options) {
    if (args.id !== undefined) {
      const u = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (u.length > 0) return idConflict('user', args.id, options)
    }

    args = JSON.parse(JSON.stringify(args))

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    if (args.password) {
      Object.assign(args, await Credentials.forStorage(args.password, args.pass_salt))
    }

    const insert = Mysql.insert(`nt_user`, mapToDbColumn(args, userDbMap))
    const userId = await Mysql.transaction(async (tx) => {
      if (isLive(args.deleted)) await assertUsernameAvailable(tx, args.username, args.gid)
      else await lockedGroup(tx, args.gid)
      return tx.execute(...insert)
    })

    // 5. Explicit Permission Management (Create nt_perm if not inheriting)
    if (userId && inherit === false) {
      await Permission.create({
        uid: userId,
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

    let query = `SELECT email
      , first_name
      , last_name
      , nt_group_id AS gid
      , nt_user_id AS id
      , username
      , email
      , deleted
     FROM nt_user`

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
        where.push(`nt_group_id IN (${gids.map(() => '?').join(',')})`)
        params.push(...gids)
      } else {
        where.push('nt_group_id = ?')
        params.push(args.gid)
      }
      delete args.gid
    }

    if (args.id) {
      where.push('nt_user_id = ?')
      params.push(args.id)
      delete args.id
    }

    if (args.username) {
      where.push('username = ?')
      params.push(args.username)
      delete args.username
    }

    if (args.deleted !== undefined) {
      where.push('deleted = ?')
      params.push(args.deleted === true ? 1 : 0)
      delete args.deleted
    }

    if (where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`
    }

    const rows = await Mysql.execute(query, params)
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
      for (const f of nullableFields) if (r[f] === null) delete r[f]
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

    const params = []
    const where = []

    if (args.id !== undefined) {
      where.push('nt_user_id = ?')
      params.push(args.id)
    }
    if (args.gid !== undefined) {
      where.push('nt_group_id = ?')
      params.push(args.gid)
    }
    if (args.username !== undefined) {
      where.push('username = ?')
      params.push(args.username)
    }
    if (args.deleted !== undefined) {
      where.push('deleted = ?')
      params.push(args.deleted === true ? 1 : 0)
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

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    const update = Mysql.update(`nt_user`, { nt_user_id: id }, mapToDbColumn(args, userDbMap))
    const claimsName = args.username !== undefined || args.gid !== undefined || args.deleted !== undefined
    if (!claimsName && inherit === undefined) {
      if (Object.keys(args).length === 0) return true
      return (await Mysql.execute(...update)).changedRows === 1
    }

    // the user's row lock orders concurrent moves and permission changes
    return Mysql.transaction(async (tx) => {
      const [user] = await tx.execute(
        'SELECT nt_group_id AS gid, username, deleted FROM nt_user WHERE nt_user_id = ? FOR UPDATE',
        [id],
      )
      if (!user) return false
      if (claimsName && isLive(args.deleted ?? user.deleted)) {
        await assertUsernameAvailable(tx, args.username ?? user.username, args.gid ?? user.gid, id)
      } else if (args.gid !== undefined) {
        await lockedGroup(tx, args.gid)
      }

      let changed = false
      if (Object.keys(args).length > 0) changed = (await tx.execute(...update)).changedRows === 1

      // a user's permission rows, deleted ones too, live in the user's group
      const gid = args.gid ?? user.gid
      if (gid !== user.gid) {
        await tx.execute('UPDATE nt_perm SET nt_group_id = ? WHERE nt_user_id = ?', [gid, id])
      }
      if (inherit !== undefined && (await setInherit(tx, id, gid, user.username, inherit))) changed = true
      return changed || Object.keys(args).length === 0
    })
  }

  async delete(args) {
    if (isLive(args.deleted ?? true)) return this.put({ id: args.id, deleted: false })
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_user`,
        { nt_user_id: args.id },
        {
          deleted: args.deleted ?? 1,
        },
      ),
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

async function setInherit(tx, uid, gid, username, inherit) {
  const [live] = await tx.execute(
    'SELECT nt_perm_id AS id FROM nt_perm WHERE nt_user_id = ? AND deleted = 0',
    [uid],
  )
  if (inherit === false && live) {
    return (
      (await tx.execute('UPDATE nt_perm SET inherit_perm = 0 WHERE nt_perm_id = ?', [live.id]))
        .changedRows === 1
    )
  }

  // a soft-deleted row is a revoked one, so it never comes back with its grants
  const removed = (await tx.execute('DELETE FROM nt_perm WHERE nt_user_id = ?', [uid])).affectedRows > 0
  if (inherit === true) return removed

  await tx.execute(
    ...Mysql.insert(`nt_perm`, {
      nt_user_id: uid,
      nt_group_id: gid,
      inherit_perm: 0,
      perm_name: `User ${username} perms`,
    }),
  )
  return true
}
