import Mysql from '../../mysql.js'
import NameserverBase, { nameserverInUse } from './base.js'
import { idConflict } from '../../store/error.js'
import { mapToDbColumn } from '../../util.js'

const nsDbMap = { id: 'nt_nameserver_id', gid: 'nt_group_id' }
const boolFields = ['deleted', 'export_serials']

// Runtime configuration the supervisor consumes. Structured, so it round-trips
// through JSON columns rather than getting a column per leaf field.
const jsonFields = ['listen', 'publisher', 'transport', 'dnssec']

class Nameserver extends NameserverBase {
  constructor() {
    super()
    this.mysql = Mysql
  }

  async create(args, options) {
    if (args.id !== undefined) {
      const g = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (g.length > 0) return idConflict('nameserver', args.id, options)
    }

    args = await resolveType(args)

    return await Mysql.execute(...Mysql.insert(`nt_nameserver`, mapToDbColumn(objectToDb(args), nsDbMap)))
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
        , ns.listen
        , ns.publisher
        , ns.transport
        , ns.dnssec
        , ns.deleted
        , t.name AS type
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
    args = await resolveType(args)
    const id = args.id
    delete args.id
    const update = Mysql.update(
      `nt_nameserver`,
      { nt_nameserver_id: id },
      mapToDbColumn(objectToDb(args), nsDbMap),
    )
    if (!args.deleted) return (await Mysql.execute(...update)).changedRows === 1
    return this._retire(id, async (tx) => (await tx.execute(...update)).changedRows === 1)
  }

  async delete(args) {
    const deleted = args.deleted ?? 1
    const update = Mysql.update(`nt_nameserver`, { nt_nameserver_id: args.id }, { deleted })
    if (!deleted) return (await Mysql.execute(...update)).changedRows === 1
    return this._retire(args.id, async (tx) => (await tx.execute(...update)).changedRows === 1)
  }

  // The row lock waits out zone writes holding this nameserver, so the read
  // after it sees their links.
  async _retire(id, write) {
    return Mysql.transaction(async (tx) => {
      const [row] = await tx.execute('SELECT 1 FROM nt_nameserver WHERE nt_nameserver_id = ? FOR UPDATE', [
        id,
      ])
      if (!row) return false
      const inUse = await tx.execute(
        `SELECT 1 FROM nt_zone_nameserver nzns
           JOIN nt_zone z ON z.nt_zone_id = nzns.nt_zone_id
          WHERE nzns.nt_nameserver_id = ? AND z.deleted = 0
          LIMIT 1`,
        [id],
      )
      if (inUse.length) throw nameserverInUse(id)
      return write(tx)
    })
  }

  async destroy({ id, gid }) {
    if (id === undefined && gid === undefined) throw new Error('destroy() needs one of id, gid')
    const where = {}
    if (id !== undefined) where.nt_nameserver_id = id
    if (gid !== undefined) where.nt_group_id = gid
    const r = await Mysql.execute(...Mysql.delete(`nt_nameserver`, where))
    return r.affectedRows > 0
  }

  disconnect() {
    return this.mysql?.disconnect()
  }
}

export default Nameserver

/**
 * `type` is stored as the export_type_id foreign key, so a write has to resolve
 * the name to its id.
 */
async function resolveType(argsIn) {
  if (argsIn.type === undefined) return argsIn

  const args = JSON.parse(JSON.stringify(argsIn))
  const rows = await Mysql.execute(
    ...Mysql.select('SELECT id FROM nt_nameserver_export_type', { name: args.type }),
  )
  if (!rows.length) throw new Error(`unknown nameserver type: ${args.type}`)

  args.export_type_id = rows[0].id
  delete args.type
  return args
}

function dbToObject(rows) {
  for (const row of rows) {
    for (const f of ['description', 'address6', 'remote_login', 'datadir', 'logdir', 'export_status']) {
      if ([undefined, null].includes(row[f])) row[f] = ''
    }
    for (const f of jsonFields) {
      // mysql2 already decodes JSON columns; a string means an older driver or
      // a TEXT column left over from a hand-run migration.
      if (typeof row[f] === 'string') {
        try {
          row[f] = JSON.parse(row[f])
        } catch {
          row[f] = null
        }
      }
      if (row[f] === null || row[f] === undefined) delete row[f]
    }
    for (const f of ['export']) {
      for (const p of ['interval', 'serials', 'status']) {
        if (![null, undefined].includes(row[`${f}_${p}`])) {
          if (row[f] === undefined) row[f] = {}
          row[f][p] = row[`${f}_${p}`]
        }
        delete row[`${f}_${p}`]
      }
    }
  }
  return rows
}

function objectToDb(row) {
  row = JSON.parse(JSON.stringify(row)) // don't mutate the original

  for (const f of jsonFields) {
    if (row[f] === undefined) continue
    row[f] = row[f] === null ? null : JSON.stringify(row[f])
  }

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
