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

    return await Mysql.execute(
      ...Mysql.insert(`nt_perm`, mapToDbColumn(objectToDb(args), permDbMap)),
    )
  }

  async get(args) {
    const query = `SELECT p.nt_perm_id AS id
        , p.nt_user_id AS uid
        , p.nt_group_id AS gid
        , p.inherit_perm AS inherit
        , p.perm_name AS name
        ${getPermFields()}
        , p.deleted
      FROM nt_perm p`
    // Mysql.debug(1)
    if (args.deleted === undefined) args.deleted = false

    const rows = await Mysql.execute(
      ...Mysql.select(query, mapToDbColumn(args, permDbMap)),
    )
    if (rows.length === 0) return
    if (rows.length > 1) {
      throw new Error(
        `permissions.get found ${rows.length} rows for uid ${args.uid}`,
      )
    }
    return dbToObject(rows[0])
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
    WHERE p.deleted=0
      AND u.deleted=0
      AND u.nt_user_id=?`
    const rows = await Mysql.execute(...Mysql.select(query, [args.uid]))
    return dbToObject(rows[0])
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    // Mysql.debug(1)
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_perm`,
        `nt_perm_id=${id}`,
        mapToDbColumn(args, permDbMap),
      ),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    await Mysql.execute(`UPDATE nt_perm SET deleted=? WHERE nt_perm_id=?`, [
      args.deleted ?? 1,
      args.id,
    ])
    return true
  }

  async destroy(args) {
    return await Mysql.execute(
      ...Mysql.delete(`nt_perm`, mapToDbColumn(args, permDbMap)),
    )
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
  const newRow = JSON.parse(JSON.stringify(row))
  for (const f of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const p of ['create', 'write', 'delete', 'delegate']) {
      if (newRow[`${f}_${p}`] !== undefined) {
        if (newRow[f] === undefined) newRow[f] = {}
        newRow[f][p] = newRow[`${f}_${p}`] === 1
        delete newRow[`${f}_${p}`]
      }
    }
  }
  for (const b of boolFields) {
    newRow[b] = newRow[b] === 1
  }
  if (newRow.uid !== undefined) {
    newRow.user.id = newRow.uid
    delete newRow.uid
  }
  if (newRow.gid !== undefined) {
    newRow.group.id = newRow.gid
    delete newRow.gid
  }
  newRow.nameserver.usable = []
  if (![undefined, ''].includes(newRow.usable_ns)) {
    newRow.nameserver.usable = newRow.usable_ns.split(',')
  }
  delete newRow.usable_ns
  return newRow
}

function objectToDb(row) {
  const newRow = JSON.parse(JSON.stringify(row))
  if (newRow?.user?.id !== undefined) {
    newRow.uid = newRow.user.id
    delete newRow.user.id
  }
  if (newRow?.group?.id !== undefined) {
    newRow.gid = newRow.group.id
    delete newRow.group.id
  }
  if (newRow?.nameserver?.usable !== undefined) {
    newRow.usable_ns = newRow.nameserver.usable.join(',')
    delete newRow.nameserver.usable
  }
  for (const f of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const p of ['create', 'write', 'delete', 'delegate']) {
      if (newRow[f] === undefined) continue
      if (newRow[f][p] === undefined) continue
      newRow[`${f}_${p}`] = newRow[f][p] === true ? 1 : 0
      delete newRow[f][p]
    }
    delete newRow[f]
  }
  for (const b of boolFields) {
    newRow[b] = newRow[b] === true ? 1 : 0
  }
  return newRow
}
