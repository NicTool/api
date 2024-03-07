import { typeMap } from '@nictool/dns-resource-record'

import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const zrDbMap = { id: 'nt_zone_record_id', zid: 'nt_zone_id' }
const boolFields = ['deleted']

class ZoneRecord {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    args = JSON.parse(JSON.stringify(args))
    args.type_id = typeMap[args.type]
    delete args.type

    return await Mysql.execute(
      ...Mysql.insert(`nt_zone_record`, mapToDbColumn(args, zrDbMap)),
    )
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const rows = await Mysql.execute(
      ...Mysql.select(
        `SELECT nt_zone_record_id AS id
        , nt_zone_id AS zid
        , name
        , ttl
        , description
        , type_id
        , address
        , weight
        , priority
        , other
        , location
        , timestamp
        , deleted
      FROM nt_zone_record`,
        mapToDbColumn(args, zrDbMap),
      ),
    )

    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      for (const f of [
        'description',
        'other',
        'location',
        'weight',
        'priority',
        'timestamp',
      ]) {
        if (null === row[f]) delete row[f]
      }
      row.type = typeMap[row.type_id]
      delete row.type_id
      if (args.deleted === false) delete row.deleted
    }

    return rows
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_zone_record`,
        `nt_zone_record_id=${id}`,
        mapToDbColumn(args, zrDbMap),
      ),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone_record`, `nt_zone_record_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(
      ...Mysql.delete(`nt_zone_record`, { nt_zone_record_id: args.id }),
    )
    return r.affectedRows === 1
  }
}

export default new ZoneRecord()
