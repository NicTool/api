const Mysql = require('./mysql')
const Util = require('./util')

const permDbMap = {
  id: 'nt_perm_id',
  uid: 'nt_user_id',
  gid: 'nt_group_id',
  inherit: 'inherit_perm',
  name: 'perm_name',
}

const boolFields = [
  'group_create',
  'group_delete',
  'group_write',
  'nameserver_create',
  'nameserver_delete',
  'nameserver_write',
  'self_write',
  'user_create',
  'user_delete',
  'user_write',
  'zone_create',
  'zone_delegate',
  'zone_delete',
  'zone_write',
  'zonerecord_create',
  'zonerecord_delegate',
  'zonerecord_delete',
  'zonerecord_write',
  'inherit',
  'deleted',
]

class Permission {
  constructor() {}

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length) return g[0].id
    }

    return await Mysql.insert(
      `INSERT INTO nt_perm`,
      Util.mapToDbColumn(args, permDbMap),
    )
  }

  async get(args) {
    const rows = await Mysql.select(
      `SELECT nt_perm_id AS id
        , nt_user_id AS uid
        , nt_group_id AS gid
        , inherit_perm AS inherit
        , perm_name AS name
        ${getPermFields()}
        , deleted
      FROM nt_perm WHERE`,
      Util.mapToDbColumn(args, permDbMap),
    )
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
    }
    return rows
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    // Mysql.debug(1)
    const r = await Mysql.update(
      `UPDATE nt_perm SET`,
      `WHERE nt_perm_id=${id}`,
      Util.mapToDbColumn(args, permDbMap),
    )
    return r.changedRows === 1
  }

  async delete(args, val) {
    const g = await this.get(args)
    if (g.length !== 1) return false
    await Mysql.execute(`UPDATE nt_perm SET deleted=? WHERE nt_perm_id=?`, [
      val ?? 1,
      g[0].id,
    ])
    return true
  }

  async destroy(args) {
    const g = await this.get(args)
    if (g.length === 1) {
      await Mysql.execute(`DELETE FROM nt_perm WHERE nt_perm_id=?`, [g[0].id])
    }
  }
}

module.exports = new Permission()
module.exports._mysql = Mysql

function getPermFields() {
  return (
    `, nt_perm.` +
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
    ].join(`, nt_perm.`)
  )
}