import Mysql from '../../mysql.js'
import GroupBase, { missingParent, siblingNameConflict } from './base.js'
import Permission from '../../permission/index.js'
import { idConflict } from '../../store/error.js'
import { mapToDbColumn } from '../../util.js'
import { assertGroupNameAvailable, lockGroupName } from '../../user/store/mysql.js'

const groupDbMap = { id: 'nt_group_id', parent_gid: 'parent_group_id' }
const boolFields = ['deleted']

// callers hold the group name lock
async function assertSiblingNameAvailable(tx, id, parentGid, name) {
  const [taken] = await tx.execute(
    `SELECT 1 FROM nt_group
      WHERE deleted = 0 AND parent_group_id = ? AND name = ? AND nt_group_id <> ? LIMIT 1`,
    [parentGid, name, id],
  )
  if (taken) throw siblingNameConflict(name, parentGid)
}

// Ahead of the name lock, the order a rename takes its row and name in.
async function lockAncestors(tx, parentGid) {
  const ancestors = []
  for (let gid = parentGid; gid !== 0 && !ancestors.includes(gid);) {
    const [row] = await tx.execute(
      'SELECT parent_group_id AS parent, deleted FROM nt_group WHERE nt_group_id = ? LOCK IN SHARE MODE',
      [gid],
    )
    if (!row && gid === parentGid) throw missingParent(gid)
    if (!row) break
    ancestors.push(gid)
    if (row.deleted) break
    gid = row.parent
  }
  return ancestors
}

class Group extends GroupBase {
  constructor() {
    super()
    this.mysql = Mysql
  }

  async create(args, options) {
    if (args.id !== undefined) {
      const g = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (g.length > 0) return idConflict('group', args.id, options)
    }

    const usable_ns = args.usable_ns
    delete args.usable_ns

    const parent_gid = args.parent_gid ?? 0

    // an explicit id can meet users left behind by a destroyed group
    const insert = Mysql.insert(`nt_group`, mapToDbColumn(args, groupDbMap))
    const insertId = await Mysql.transaction(async (tx) => {
      const ancestors = await lockAncestors(tx, parent_gid)
      const inserted = await tx.execute(...insert)
      const id = args.id ?? inserted
      if (!(args.deleted === true || args.deleted === 1)) {
        await assertGroupNameAvailable(tx, id, args.name)
        await assertSiblingNameAvailable(tx, id, parent_gid, args.name)
      }
      if (id) await this.addToSubgroups(tx, id, ancestors)
      return inserted
    })
    // MySQL 8.0 returns insertId 0 for an explicit-id insert into an
    // AUTO_INCREMENT column, so fall back to the supplied id; otherwise the
    // subgroup + permission wiring below runs against the wrong gid (or is skipped).
    const gid = args.id ?? insertId

    await Permission.create({
      gid,
      name: `Group ${args.name} perms`,
      nameserver: { usable: Array.isArray(usable_ns) ? usable_ns : [] },
    })

    return gid
  }

  async addToSubgroups(tx, gid, ancestors) {
    // `rank` is a reserved word in MySQL 8.0+, so it must be backticked; the
    // generic Mysql.insert helper doesn't quote column names.
    for (const [i, ancestor] of ancestors.entries()) {
      await tx.execute('INSERT INTO nt_group_subgroups (nt_group_id,nt_subgroup_id,`rank`) VALUES(?,?,?)', [
        ancestor,
        gid,
        1000 - i,
      ])
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
          [args.id],
        )
        const gids = [args.id, ...subgroupRows.map((r) => r.nt_subgroup_id)]
        where.push(`g.nt_group_id IN (${gids.map(() => '?').join(',')})`)
        params.push(...gids)
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
      params.push(args.deleted ? 1 : 0)
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
      if ([false, undefined].includes(args_orig.deleted)) delete row.deleted

      const perm = await Permission.get({ gid: row.id })
      if (perm) {
        row.permissions = perm
      }
    }
    return groups
  }

  // rootGid plus every descendant subgroup id, from the nt_group_subgroups
  // closure table (the same source the include_subgroups get() uses).
  async subgroupGids(rootGid) {
    const rows = await Mysql.execute('SELECT nt_subgroup_id FROM nt_group_subgroups WHERE nt_group_id = ?', [
      rootGid,
    ])
    return [rootGid, ...rows.map((r) => r.nt_subgroup_id)]
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id

    const usable_ns = args.usable_ns
    delete args.usable_ns

    const columns = Object.keys(args).length > 0
    if (!columns && usable_ns === undefined) return true
    const update = Mysql.update(`nt_group`, { nt_group_id: id }, mapToDbColumn(args, groupDbMap))
    const claimsName = args.name !== undefined || args.deleted !== undefined
    const claimsSlot = claimsName || args.parent_gid !== undefined

    // the group permission row changes with the rename, so a refused rename leaves both alone
    return Mysql.transaction(async (tx) => {
      const [row] = await tx.execute(
        'SELECT name, parent_group_id, deleted FROM nt_group WHERE nt_group_id = ? FOR UPDATE',
        [id],
      )
      if (!row) return false
      const deleted = args.deleted ?? row.deleted
      if (claimsSlot && !(deleted === true || deleted === 1)) {
        const name = args.name ?? row.name
        if (claimsName) await assertGroupNameAvailable(tx, id, name)
        else await lockGroupName(tx, name)
        await assertSiblingNameAvailable(tx, id, args.parent_gid ?? row.parent_group_id, name)
      }
      const changed = columns ? (await tx.execute(...update)).changedRows === 1 : true
      if (usable_ns !== undefined) {
        await tx.execute(
          `UPDATE nt_perm SET usable_ns = ?
            WHERE nt_group_id = ? AND (nt_user_id IS NULL OR nt_user_id = 0) AND deleted = 0`,
          [(Array.isArray(usable_ns) ? usable_ns : []).join(','), id],
        )
      }
      return changed
    })
  }

  async delete(args) {
    if (!(args.deleted ?? true)) return this.put({ id: args.id, deleted: false })
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_group`,
        { nt_group_id: args.id },
        {
          deleted: args.deleted ?? 1,
        },
      ),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    // Clean up associated permission and subgroup-closure rows before removing the group
    await Mysql.execute(`DELETE FROM nt_perm WHERE nt_group_id = ? AND nt_user_id IS NULL`, [args.id])
    await Mysql.execute(`DELETE FROM nt_group_subgroups WHERE nt_group_id = ? OR nt_subgroup_id = ?`, [
      args.id,
      args.id,
    ])
    const r = await Mysql.execute(...Mysql.delete(`nt_group`, { nt_group_id: args.id }))
    return r.affectedRows === 1
  }

  disconnect() {
    return this.mysql?.disconnect()
  }
}

export default Group
