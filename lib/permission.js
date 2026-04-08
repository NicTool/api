import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const permDbMap = {
  id: 'nt_perm_id',
  uid: 'nt_user_id',
  gid: 'nt_group_id',
  inherit: 'inherit_perm',
  name: 'perm_name',
}

class Permission {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const p = await this.get({ id: args.id })
      if (p) return p.id
    }

    // Deduplicate group-level permission rows (uid IS NULL) to prevent accumulation
    if (args.gid !== undefined && args.uid === undefined) {
      const rows = await Mysql.execute(
        `SELECT nt_perm_id FROM nt_perm WHERE nt_group_id = ? AND nt_user_id IS NULL LIMIT 1`,
        [args.gid],
      )
      if (rows.length > 0) return rows[0].nt_perm_id
    }

    return await Mysql.execute(...Mysql.insert(`nt_perm`, mapToDbColumn(objectToDb(args), permDbMap)))
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

    // Build WHERE manually so we can express IS NULL for group-level lookups.
    // When no uid is given (gid-only query), restrict to rows where uid IS NULL
    // to avoid matching per-user permission rows in the same group.
    const dbArgs = mapToDbColumn(args, permDbMap)
    const conditions = []
    const params = []
    for (const [col, val] of Object.entries(dbArgs)) {
      conditions.push(`p.${col} = ?`)
      params.push(val)
    }
    if (!('nt_user_id' in dbArgs) && !('nt_perm_id' in dbArgs)) {
      conditions.push('p.nt_user_id IS NULL')
    }
    const query = conditions.length
      ? `${baseQuery} WHERE ${conditions.join(' AND ')}`
      : baseQuery

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
    WHERE p.nt_user_id IS NULL
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
    delete args.id
    const r = await Mysql.execute(
      ...Mysql.update(`nt_perm`, `nt_perm_id=${id}`, mapToDbColumn(args, permDbMap)),
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

  /**
   * Returns the effective permissions for a user:
   * - If the user has their own nt_perm row with inherit=false, return it.
   * - Otherwise return the group-level permissions.
   */
  async getEffective(uid) {
    const userPerm = await this.get({ uid })
    if (userPerm && userPerm.inherit === false) return userPerm
    return this.getGroup({ uid })
  }

  /**
   * Returns true if the user is allowed to perform `action` on `resource`.
   * resource: 'zone' | 'zonerecord' | 'user' | 'group' | 'nameserver'
   * action:   'create' | 'write' | 'delete' | 'delegate'
   */
  async canDo(uid, resource, action) {
    const perm = await this.getEffective(uid)
    if (!perm) return false
    return perm[resource]?.[action] === true
  }
}

export default new Permission()

function getPermFields() {
  return (
    `, p.` +
    [
      'group_write',
      'group_create',
      'group_delete',

      'zone_write',
      'zone_create',
      'zone_delegate',
      'zone_delete',

      'zonerecord_write',
      'zonerecord_create',
      'zonerecord_delegate',
      'zonerecord_delete',

      'user_write',
      'user_create',
      'user_delete',

      'nameserver_write',
      'nameserver_create',
      'nameserver_delete',

      'self_write',
      'usable_ns',
    ].join(`, p.`)
  )
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
  "group_create": 0,
  "group_delete": 0,
  "zone_write": 1,
  "zone_create": 1,
  "zone_delegate": 1,
  "zone_delete": 1,
  "zonerecord_write": 0,
  "zonerecord_create": 0,
  "zonerecord_delegate": 0,
  "zonerecord_delete": 0,
  "user_write": 0,
  "user_create": 0,
  "user_delete": 0,
  "nameserver_write": 0,
  "nameserver_create": 0,
  "nameserver_delete": 0,
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
  "zonerecord": {
    "create": false,
    "write": false,
    "delete": false,
    "delegate": false
  },
  "user": { "id": 4096, "create": false, "write": false, "delete": false }
}
*/

const boolFields = ['self_write', 'inherit', 'deleted']

function dbToObject(row) {
  row = JSON.parse(JSON.stringify(row))
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
