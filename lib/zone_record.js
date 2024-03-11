import * as RR from '@nictool/dns-resource-record'

import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const zrDbMap = { id: 'nt_zone_record_id', zid: 'nt_zone_id', owner: 'name' }
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

    new RR[args.type](args)

    args = objectToDb(args)

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

      if (args.deleted === false) delete row.deleted
    }

    return dbToObject(rows)
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

function dbToObject(rows) {
  rows = JSON.parse(JSON.stringify(rows))

  for (const row of rows) {
    row.owner = row.name
    delete row.name

    row.type = RR.typeMap[row.type_id]
    delete row.type_id

    const map = getMap(row.type)
    if (map) unApplyMap(row, map)

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
  }

  return rows
}

function objectToDb(obj) {
  obj = JSON.parse(JSON.stringify(obj))

  const map = getMap(obj.type)
  if (map) applyMap(obj, map)

  obj.type_id = RR.typeMap[obj.type]
  delete obj.type

  return obj
}

function applyMap(obj, map) {
  for (const [key, value] of Object.entries(map)) {
    obj[key] = obj[value]
    delete obj[value]
  }
}

function unApplyMap(obj, map) {
  for (const [key, value] of Object.entries(map)) {
    switch (value) {
      case 'key tag': // DS record
      case 'port': // SRV
        obj[value] = parseInt(obj[key])
        break
      default:
        obj[value] = obj[key]
    }
    delete obj[key]
  }
}

function getMap(rrType) {
  switch (rrType) {
    case 'CAA':
      return {
        weight: 'flags',
        other: 'tag',
        address: 'value',
      }
    case 'CERT':
      return {
        other: 'cert type',
        priority: 'key tag',
        weight: 'algorithm',
        address: 'certificate',
      }
    case 'CNAME':
      return { address: 'cname' }
    case 'DNAME':
      return { address: 'target' }
    case 'DNSKEY':
      return {
        address: 'public key',
        weight: 'flags',
        priority: 'protocol',
        other: 'algorithm',
      }
    case 'DS':
      return {
        address: 'digest',
        weight: 'digest type',
        priority: 'algorithm',
        other: 'key tag',
      }
    case 'HINFO':
      return { address: 'os', other: 'cpu' }
    case 'IPSECKEY':
      return {
        address: 'gateway',
        description: 'publickey',
        weight: 'precedence',
        priority: 'gateway type',
        other: 'algorithm',
      }
    case 'MX':
      return { weight: 'preference', address: 'exchange' }
    case 'NAPTR':
      return {
        weight: 'order',
        priority: 'preference',
        description: 'replacement',
      }
    case 'NS':
      return { address: 'dname' }
    case 'SPF':
      return { address: 'data' }
    case 'SSHFP':
      return {
        address: 'fingerprint',
        weight: 'algorithm',
        priority: 'fptype',
      }
    case 'SRV':
      return { address: 'target', other: 'port' }
    case 'SVCB':
      return {
        address: 'target name',
        other: 'params',
      }
    case 'TXT':
      return { address: 'data' }
    case 'URI':
      return { address: 'target' }
  }
}
