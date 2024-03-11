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
      ...Mysql.insert(`nt_zone`, mapToDbColumn(args, zoneDbMap)),
    )
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

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
    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      for (const f of ['description', 'location']) {
        if ([null].includes(row[f])) row[f] = ''
      }
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
        `nt_zone`,
        `nt_zone_id=${id}`,
        mapToDbColumn(args, zoneDbMap),
      ),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone`, `nt_zone_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(
      ...Mysql.delete(`nt_zone`, { nt_zone_id: args.id }),
    )
    return r.affectedRows === 1
  }
}

export default new Zone()
