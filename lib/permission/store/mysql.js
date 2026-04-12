import Mysql from '../../mysql.js'
import { mapToDbColumn } from '../../util.js'
import PermissionBase from './base.js'

const permDbMap = {
  id: 'nt_perm_id',
  uid: 'nt_user_id',
  gid: 'nt_group_id',
  inherit: 'inherit_perm',
  name: 'perm_name',
}

const permissionColumns = [
  'group_write', 'group_create', 'group_delete',
  'zone_write', 'zone_create', 'zone_delegate', 'zone_delete',
  'zonerecord_write', 'zonerecord_create', 'zonerecord_delegate', 'zonerecord_delete',
  'user_write', 'user_create', 'user_delete',
  'nameserver_write', 'nameserver_create', 'nameserver_delete',
]

class PermissionRepoMySQL extends PermissionBase {
  constructor(args = {}) {
    super(args)
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const rows = await Mysql.execute(
        'SELECT nt_perm_id, deleted FROM nt_perm WHERE nt_perm_id = ? LIMIT 1',
        [args.id],
      )
      if (rows.length > 0) return this.reuse(rows[0], args)
    }

    // v2 uses uid=0 for group rows; v3-created rows use NULL.
    if (args.gid !== undefined && args.uid === undefined) {
      const rows = await Mysql.execute(
        `SELECT nt_perm_id, deleted FROM nt_perm
         WHERE nt_group_id = ? AND (nt_user_id IS NULL OR nt_user_id = 0)
         ORDER BY deleted, nt_perm_id LIMIT 1`,
        [args.gid],
      )
      if (rows.length > 0) return this.reuse(rows[0], args)
    }

    // ...and user-level rows: a second one makes get({uid}) throw, which would
    // then fail every request that user makes
    if (args.uid !== undefined && args.uid !== null) {
      const rows = await Mysql.execute(
        `SELECT nt_perm_id, deleted FROM nt_perm
         WHERE nt_user_id = ? ORDER BY deleted, nt_perm_id LIMIT 1`,
        [args.uid],
      )
      if (rows.length > 0) return this.reuse(rows[0], args)
    }

    return await Mysql.execute(...Mysql.insert(`nt_perm`, mapToDbColumn(objectToDb(args), permDbMap)))
  }

  async reuse(row, args) {
    if (row.deleted === 1) {
      const replacement = Object.fromEntries(permissionColumns.map((field) => [field, 0]))
      Object.assign(replacement, {
        self_write: 0,
        usable_ns: '',
        inherit_perm: 0,
        ...mapToDbColumn(objectToDb(args), permDbMap),
        deleted: 0,
      })
      delete replacement.nt_perm_id
      await Mysql.execute(...Mysql.update('nt_perm', `nt_perm_id=${row.nt_perm_id}`, replacement))
    }
    return row.nt_perm_id
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const baseQuery = `SELECT p.nt_perm_id AS id
        , p.nt_user_id AS uid
        , p.nt_group_id AS gid
        , p.inherit_perm AS inherit
        , p.perm_name AS name
        ${getPermFields()}
        , p.deleted
      FROM nt_perm p`

    // A gid-only lookup means the group row, not a user row in that group.
    const dbArgs = mapToDbColumn(args, permDbMap)
    const conditions = []
    const params = []
    for (const [col, val] of Object.entries(dbArgs)) {
      conditions.push(`p.${col} = ?`)
      params.push(val)
    }
    if (!('nt_user_id' in dbArgs) && !('nt_perm_id' in dbArgs)) {
      conditions.push('(p.nt_user_id IS NULL OR p.nt_user_id = 0)')
    }
    const query = conditions.length ? `${baseQuery} WHERE ${conditions.join(' AND ')}` : baseQuery

    const rows = await Mysql.execute(query, params)
    if (rows.length === 0) return
    if (rows.length > 1) {
      throw new Error(`permissions.get found ${rows.length} rows for uid ${args.uid}`)
    }
    const row = dbToObject(rows[0])
    if (args.deleted === false) delete row.deleted
    return row
  }

  async getGroup(args) {
    const query = `SELECT p.nt_perm_id AS id
      , p.nt_user_id AS uid
      , p.nt_group_id AS gid
      , p.inherit_perm AS inherit
      , p.perm_name AS name
      ${getPermFields()}
      , p.deleted
    FROM nt_perm p
    INNER JOIN nt_user u ON p.nt_group_id = u.nt_group_id
    WHERE (p.nt_user_id IS NULL OR p.nt_user_id = 0)
      AND p.deleted=${args.deleted === true ? 1 : 0}
      AND u.deleted=0
      AND u.nt_user_id=?`
    const rows = await Mysql.execute(...Mysql.select(query, [args.uid]))
    if (rows.length === 0) return
    const row = dbToObject(rows[0])
    if ([false, undefined].includes(args.deleted)) delete row.deleted
    return row
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    const row = partialToDb(args)
    delete row.id
    if (Object.keys(row).length === 0) return false
    const r = await Mysql.execute(
      ...Mysql.update(`nt_perm`, `nt_perm_id=${id}`, mapToDbColumn(row, permDbMap)),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    if (!args.id) return false
    const r = await Mysql.execute(
      ...Mysql.update(`nt_perm`, `nt_perm_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(...Mysql.delete(`nt_perm`, mapToDbColumn(args, permDbMap)))
    return r.affectedRows === 1
  }

  disconnect() {
    return this.mysql?.disconnect()
  }
}

export default PermissionRepoMySQL

function getPermFields() {
  return `, p.${[...permissionColumns, 'self_write', 'usable_ns'].join(', p.')}`
}

/* the following two functions convert to and from:

the SQL DB format:
{
  "id": 4096,
  "uid": 4096,
  "gid": 4096,
  "inherit": 1,
  "name": "Test Permission",
  "group_write": 0,
  ...
  "self_write": 0,
  "usable_ns": "",
  "deleted": 0
}

JSON object format:

{
  "id": 4096,
  "inherit": true,
  "name": "Test Permission",
  "self_write": false,
  "deleted": false,
  "group": { "id": 4096, "create": false, "write": false, "delete": false },
  "nameserver": { "usable": [], "create": false, "write": false, "delete": false },
  "zone": { "create": true, "write": true, "delete": true, "delegate": true },
  "zonerecord": { "create": false, "write": false, "delete": false, "delegate": false },
  "user": { "id": 4096, "create": false, "write": false, "delete": false }
}
*/

const boolFields = ['self_write', 'inherit', 'deleted']

function dbToObject(row) {
  row = JSON.parse(JSON.stringify(row))
  if (row.uid === 0) row.uid = null
  if (row.gid === 0) row.gid = null
  for (const f of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const p of ['create', 'write', 'delete', 'delegate']) {
      if (row[`${f}_${p}`] !== undefined) {
        if (row[f] === undefined) row[f] = {}
        row[f][p] = row[`${f}_${p}`] === 1
        delete row[`${f}_${p}`]
      }
    }
  }
  for (const b of boolFields) {
    row[b] = row[b] === 1
  }

  if (row.uid !== undefined) {
    row.user.id = row.uid
    delete row.uid
  }
  if (row.gid !== undefined) {
    row.group.id = row.gid
    delete row.gid
  }
  row.nameserver.usable = []
  if (![undefined, null, ''].includes(row.usable_ns)) {
    row.nameserver.usable = row.usable_ns?.split(',')
  }
  delete row.usable_ns
  return row
}

/**
 * Flatten the nested JSON shape to db columns for an UPDATE, touching only the
 * keys the caller supplied. objectToDb() can't be reused here: it writes every
 * boolean field unconditionally, which would reset fields the caller omitted.
 */
function partialToDb(args) {
  const row = JSON.parse(JSON.stringify(args))

  if (row.user?.id !== undefined) row.uid = row.user.id
  if (row.group?.id !== undefined) row.gid = row.group.id
  if (row.nameserver?.usable !== undefined) {
    row.usable_ns = row.nameserver.usable.join(',')
  }
  if (Array.isArray(row.usable_ns)) row.usable_ns = row.usable_ns.join(',')

  for (const f of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const p of ['create', 'write', 'delete', 'delegate']) {
      if (row[f]?.[p] === undefined) continue
      row[`${f}_${p}`] = toBit(row[f][p])
    }
    delete row[f]
  }
  for (const b of boolFields) {
    if (row[b] !== undefined) row[b] = toBit(row[b])
  }
  return row
}

// callers pass either JSON booleans or the db's own 0/1
function toBit(value) {
  return value === true || value === 1 ? 1 : 0
}

function objectToDb(row) {
  row = JSON.parse(JSON.stringify(row))
  if (row?.user?.id !== undefined) {
    row.uid = row.user.id
    delete row.user.id
  }
  if (row?.group?.id !== undefined) {
    row.gid = row.group.id
    delete row.group.id
  }
  if (row?.nameserver?.usable !== undefined) {
    row.usable_ns = row.nameserver.usable.join(',')
    delete row.nameserver.usable
  }
  for (const f of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const p of ['create', 'write', 'delete', 'delegate']) {
      if (row[f] === undefined) continue
      if (row[f][p] === undefined) continue
      row[`${f}_${p}`] = row[f][p] === true ? 1 : 0
      delete row[f][p]
    }
    delete row[f]
  }
  for (const b of boolFields) {
    row[b] = row[b] === true ? 1 : 0
  }
  return row
}
