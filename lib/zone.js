import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const zoneDbMap = { id: 'nt_zone_id', gid: 'nt_group_id' }
const boolFields = ['deleted']

class Zone {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    return await Mysql.execute(
      ...Mysql.insert(
        `nt_zone`,
        mapToDbColumn(args, zoneDbMap),
      ),
    )
  }

  async get(args) {
    const rows = await Mysql.execute(
      ...Mysql.select(
        `SELECT nt_zone_id AS id
        , nt_group_id AS gid
        , zone
        , mailaddr
        , description
        , serial
        , refresh
        , retry
        , expire
        , minimum
        , ttl
        , location
        , last_modified
        , last_publish
        , deleted
      FROM nt_zone`,
        mapToDbColumn(args, zoneDbMap),
      ),
    )
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
      for (const f of ['description', 'location']) {
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
        `nt_zone`,
        `nt_zone_id=${id}`,
        mapToDbColumn(args, zoneDbMap),
      ),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    await Mysql.execute(
      `UPDATE nt_zone SET deleted=? WHERE nt_zone_id=?`,
      [args.deleted ?? 1, args.id],
    )
    return true
  }

  async destroy(args) {
    return await Mysql.execute(
      ...Mysql.delete(`nt_zone`, { nt_zone_id: args.id }),
    )
  }
}

export default new Zone()
