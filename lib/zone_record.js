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

    // const type = await Mysql.execute(...Mysql.select(`SELECT `))

    return await Mysql.execute(
      ...Mysql.insert(`nt_zone_record`, mapToDbColumn(args, zrDbMap)),
    )
  }

  async get(args) {
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
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
      for (const f of ['description', 'other', 'location']) {
        if ([null].includes(r[f])) r[f] = ''
      }
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
    await Mysql.execute(`UPDATE nt_zone_record SET deleted=? WHERE nt_zone_record_id=?`, [
      args.deleted ?? 1,
      args.id,
    ])
    return true
  }

  async destroy(args) {
    return await Mysql.execute(
      ...Mysql.delete(`nt_zone_record`, { nt_zone_record_id: args.id }),
    )
  }
}

export default new ZoneRecord()
