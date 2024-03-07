import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const nsDbMap = { id: 'nt_nameserver_id', gid: 'nt_group_id' }
const boolFields = ['deleted', 'export_serials']

class Nameserver {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    if (args.export.type) {
      args = JSON.parse(JSON.stringify(args))
      const rows = await Mysql.execute(
        ...Mysql.select('SELECT id FROM nt_nameserver_export_type', {
          name: args.export.type,
        }),
      )
      args.export_type_id = rows[0].id
      delete args.export.type
    }

    return await Mysql.execute(
      ...Mysql.insert(
        `nt_nameserver`,
        mapToDbColumn(objectToDb(args), nsDbMap),
      ),
    )
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    if (args.name !== undefined) {
      args['ns.name'] = args.name
      delete args.name
    }
    const rows = await Mysql.execute(
      ...Mysql.select(
        `SELECT ns.nt_nameserver_id AS id
        , ns.nt_group_id AS gid
        , ns.name
        , ns.ttl
        , ns.description
        , ns.address
        , ns.address6
        , ns.remote_login
        , ns.logdir
        , ns.datadir
        , ns.export_interval
        , ns.export_serials
        , ns.export_status
        , ns.deleted
        , t.name AS export_type
      FROM nt_nameserver ns
      JOIN nt_nameserver_export_type t ON ns.export_type_id=t.id`,
        mapToDbColumn(args, nsDbMap),
      ),
    )
    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      if (args.deleted === false) delete row.deleted
    }
    return dbToObject(rows)
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    // Mysql.debug(1)
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_nameserver`,
        `nt_nameserver_id=${id}`,
        mapToDbColumn(args, nsDbMap),
      ),
    )
    // console.log(r)
    return r.changedRows === 1
  }

  async delete(args) {
    await Mysql.execute(
      `UPDATE nt_nameserver SET deleted=? WHERE nt_nameserver_id=?`,
      [args.deleted ?? 1, args.id],
    )
    return true
  }

  async destroy(args) {
    return await Mysql.execute(
      ...Mysql.delete(`nt_nameserver`, { nt_nameserver_id: args.id }),
    )
  }
}

export default new Nameserver()

function dbToObject(rows) {
  for (const row of rows) {
    for (const f of [
      'description',
      'address6',
      'remote_login',
      'datadir',
      'logdir',
      'export_status',
    ]) {
      if ([undefined, null].includes(row[f])) row[f] = ''
    }
    for (const f of ['export']) {
      for (const p of ['type', 'interval', 'serials', 'status']) {
        if (row[`${f}_${p}`] !== undefined) {
          if (row[f] === undefined) row[f] = {}
          row[f][p] = row[`${f}_${p}`]
          delete row[`${f}_${p}`]
        }
      }
    }
  }
  return rows
}

function objectToDb(row) {
  row = JSON.parse(JSON.stringify(row)) // don't mutate the original

  for (const f of ['export']) {
    for (const p of ['interval', 'serials', 'status']) {
      if (row[f] === undefined) continue
      if (row[f][p] === undefined) continue
      row[`${f}_${p}`] = row[f][p]
      delete row[f][p]
    }
    delete row[f]
  }
  return row
}
