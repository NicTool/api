import Mysql from './mysql.js'

const TYPE_META = {
  ZONE: { table: 'nt_zone', idCol: 'nt_zone_id' },
  ZONERECORD: { table: 'nt_zone_record', idCol: 'nt_zone_record_id' },
  NAMESERVER: { table: 'nt_nameserver', idCol: 'nt_nameserver_id' },
  GROUP: { table: 'nt_group', idCol: 'nt_group_id' },
}

const PERM_FIELDS = [
  'perm_write',
  'perm_delete',
  'perm_delegate',
  'zone_perm_add_records',
  'zone_perm_delete_records',
]

class Delegation {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    const { gid, oid, type } = args

    const existing = await Mysql.execute(
      `SELECT nt_group_id FROM nt_delegate
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ? AND deleted = 0`,
      [gid, oid, type],
    )
    if (existing.length > 0) return { duplicate: true }

    const row = {
      nt_group_id: gid,
      nt_object_id: oid,
      nt_object_type: type,
      delegated_by_id: args.delegated_by_id ?? 0,
      delegated_by_name: args.delegated_by_name ?? '',
    }

    for (const f of PERM_FIELDS) {
      row[f] = args[f] === false ? 0 : 1
    }

    await Mysql.execute(...Mysql.insert('nt_delegate', row))

    await this.log(row, 'delegated')

    return { created: true }
  }

  async get(args) {
    const { gid, oid, type } = args
    const objType = type ?? 'ZONE'
    const meta = TYPE_META[objType]
    if (!meta) return []

    if (oid !== undefined) {
      return this.getDelegates(oid, objType)
    }
    if (gid !== undefined) {
      return this.getDelegated(gid, objType, meta)
    }
    return []
  }

  async getDelegated(gid, objType, meta) {
    const query = `SELECT
        d.nt_group_id,
        d.nt_object_id,
        d.nt_object_type,
        g.name AS group_name,
        d.delegated_by_id,
        d.delegated_by_name,
        d.perm_write AS delegate_write,
        d.perm_delete AS delegate_delete,
        d.perm_delegate AS delegate_delegate,
        d.zone_perm_add_records AS delegate_add_records,
        d.zone_perm_delete_records AS delegate_delete_records,
        o.${meta.idCol} AS ${meta.idCol}
      FROM nt_delegate d
      JOIN ${meta.table} o ON o.${meta.idCol} = d.nt_object_id
      JOIN nt_group g ON g.nt_group_id = d.nt_group_id
      WHERE d.nt_object_type = ?
        AND d.nt_group_id = ?
        AND d.deleted = 0
        AND o.deleted = 0`

    return Mysql.execute(query, [objType, gid])
  }

  async getDelegates(oid, objType) {
    const query = `SELECT
        d.nt_group_id,
        d.nt_object_id,
        d.nt_object_type,
        g.name AS group_name,
        d.delegated_by_id,
        d.delegated_by_name,
        d.perm_write AS delegate_write,
        d.perm_delete AS delegate_delete,
        d.perm_delegate AS delegate_delegate,
        d.zone_perm_add_records AS delegate_add_records,
        d.zone_perm_delete_records AS delegate_delete_records
      FROM nt_delegate d
      JOIN nt_group g ON g.nt_group_id = d.nt_group_id
      WHERE d.nt_object_type = ?
        AND d.nt_object_id = ?
        AND d.deleted = 0`

    return Mysql.execute(query, [objType, oid])
  }

  async put(args) {
    const { gid, oid, type } = args

    const existing = await Mysql.execute(
      `SELECT nt_group_id FROM nt_delegate
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ? AND deleted = 0`,
      [gid, oid, type],
    )
    if (existing.length === 0) return null

    const updates = {}
    for (const f of PERM_FIELDS) {
      if (args[f] !== undefined) {
        updates[f] = args[f] === true ? 1 : 0
      }
    }

    if (Object.keys(updates).length === 0) return true

    const setClauses = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ')
    const values = [...Object.values(updates), gid, oid, type]

    await Mysql.execute(
      `UPDATE nt_delegate SET ${setClauses}
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ? AND deleted = 0`,
      values,
    )

    await this.log(
      { nt_group_id: gid, nt_object_id: oid, nt_object_type: type, ...updates },
      'modified',
    )

    return true
  }

  async delete(args) {
    const { gid, oid, type } = args

    const existing = await Mysql.execute(
      `SELECT nt_group_id, perm_write, perm_delete, perm_delegate,
              zone_perm_add_records, zone_perm_delete_records
       FROM nt_delegate
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ? AND deleted = 0`,
      [gid, oid, type],
    )
    if (existing.length === 0) return null

    await this.log(
      {
        nt_group_id: gid,
        nt_object_id: oid,
        nt_object_type: type,
        ...existing[0],
      },
      'deleted',
    )

    await Mysql.execute(
      `DELETE FROM nt_delegate
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ?`,
      [gid, oid, type],
    )

    return true
  }

  async log(data, action) {
    const row = {
      nt_user_id: data.delegated_by_id ?? 0,
      nt_user_name: data.delegated_by_name ?? '',
      action,
      nt_object_type: data.nt_object_type,
      nt_object_id: data.nt_object_id,
      nt_group_id: data.nt_group_id,
      timestamp: Math.floor(Date.now() / 1000),
      perm_write: data.perm_write ?? 1,
      perm_delete: data.perm_delete ?? 1,
      perm_delegate: data.perm_delegate ?? 1,
      zone_perm_add_records: data.zone_perm_add_records ?? 1,
      zone_perm_delete_records: data.zone_perm_delete_records ?? 1,
    }

    await Mysql.execute(...Mysql.insert('nt_delegate_log', row))
  }
}

export default new Delegation()
