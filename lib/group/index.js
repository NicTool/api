import Mysql from '../mysql.js'
import Permission from '../permission.js'
import { mapToDbColumn } from '../util.js'

const groupDbMap = { id: 'nt_group_id', parent_gid: 'parent_group_id' }
const boolFields = ['deleted']

class Group {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    const usable_ns = args.usable_ns
    delete args.usable_ns

    const parent_gid = args.parent_gid ?? 0

    const gid = await Mysql.execute(...Mysql.insert(`nt_group`, mapToDbColumn(args, groupDbMap)))

    if (gid && parent_gid !== 0) {
      await this.addToSubgroups(gid, parent_gid)
    }

    await Permission.create({
      gid,
      name: `Group ${args.name} perms`,
      nameserver: { usable: Array.isArray(usable_ns) ? usable_ns : [] },
    })

    return gid
  }

  async addToSubgroups(gid, parent_gid, rank = 1000) {
    if (!parent_gid || parent_gid === 0) return

    await Mysql.execute(...Mysql.insert('nt_group_subgroups', {
      nt_group_id: parent_gid,
      nt_subgroup_id: gid,
      rank,
    }))

    const parent = await this.get({ id: parent_gid })
    if (parent.length === 1 && parent[0].parent_gid !== 0) {
      await this.addToSubgroups(gid, parent[0].parent_gid, rank - 1)
    }
  }

  async get(args_orig) {
    const args = JSON.parse(JSON.stringify(args_orig))
    if (args.deleted === undefined) args.deleted = false

    const include_subgroups = args.include_subgroups === true
    delete args.include_subgroups

    let query = `SELECT g.nt_group_id AS id
        , g.parent_group_id AS parent_gid
        , g.name
        , g.deleted
      FROM nt_group g`

    const params = []
    const where = []

    if (args.id) {
      if (include_subgroups) {
        const subgroupRows = await Mysql.execute(
          'SELECT nt_subgroup_id FROM nt_group_subgroups WHERE nt_group_id = ?',
          [args.id]
        )
        const gids = [args.id, ...subgroupRows.map(r => r.nt_subgroup_id)]
        where.push(`g.nt_group_id IN (${gids.join(',')})`)
      } else {
        where.push('g.nt_group_id = ?')
        params.push(args.id)
      }
      delete args.id
    }

    if (args.parent_gid !== undefined) {
      where.push('g.parent_group_id = ?')
      params.push(args.parent_gid)
      delete args.parent_gid
    }

    if (args.name) {
      where.push('g.name = ?')
      params.push(args.name)
      delete args.name
    }

    if (args.deleted !== undefined) {
      where.push('g.deleted = ?')
      params.push(args.deleted === true ? 1 : 0)
      delete args.deleted
    }

    if (where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`
    }

    const groups = await Mysql.execute(query, params)

    for (const row of groups) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      if (args_orig.deleted === false) delete row.deleted

      const perm = await Permission.get({ gid: row.id })
      if (perm) {
        row.permissions = perm
      }
    }
    return groups
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id

    const usable_ns = args.usable_ns
    delete args.usable_ns

    if (usable_ns !== undefined) {
      const perm = await Permission.get({ gid: id })
      if (perm) {
        await Permission.put({
          id: perm.id,
          nameserver: { usable: Array.isArray(usable_ns) ? usable_ns : [] }
        })
      }
    }

    if (Object.keys(args).length === 0) return true

    const r = await Mysql.execute(
      ...Mysql.update(`nt_group`, `nt_group_id=${id}`, mapToDbColumn(args, groupDbMap)),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    // 2. Delete Safety Checks
    const id = args.id

    // Check for active zones
    const zoneRows = await Mysql.execute('SELECT COUNT(*) AS count FROM nt_zone WHERE nt_group_id = ? AND deleted = 0', [id])
    if (zoneRows[0].count > 0) {
      throw new Error('Cannot delete group: active zones still exist.')
    }

    // Check for active users
    const userRows = await Mysql.execute('SELECT COUNT(*) AS count FROM nt_user WHERE nt_group_id = ? AND deleted = 0', [id])
    if (userRows[0].count > 0) {
      throw new Error('Cannot delete group: active users still exist.')
    }

    // Check for active subgroups
    const subgroupRows = await Mysql.execute('SELECT COUNT(*) AS count FROM nt_group WHERE parent_group_id = ? AND deleted = 0', [id])
    if (subgroupRows[0].count > 0) {
      throw new Error('Cannot delete group: active subgroups still exist.')
    }

    const r = await Mysql.execute(
      ...Mysql.update(`nt_group`, `nt_group_id=${id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(...Mysql.delete(`nt_group`, { nt_group_id: args.id }))
    return r.affectedRows === 1
  }
}

export default new Group()
