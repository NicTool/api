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

    try {
      const zr = new RR[args.type](args)
      console.log(zr)
    }
    catch (e) {
      console.error(e.message)
    }

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

  switch (obj.type) {
    case 'CAA':
      applyMap(obj, {
        weight: 'flags',
        priority: 'tag',
        address: 'value',
      })
      break
    case 'CNAME':
      applyMap(obj, { address: 'cname' })
    case 'DNAME':
      applyMap(obj, { address: 'target' })
    case 'DNSKEY':
      applyMap(obj, {
        address: 'public key',
        weight: 'flags',
        priority: 'protocol',
        other: 'algorithm',
      })
      break
    case 'HINFO':
      obj.name = `${obj.cpu} ${obj.os}`; delete obj.cpu; delete obj.os
      obj.address = obj.description; delete obj.description
      break
    case 'IPSECKEY':
      applyMap(obj, {
        address: 'gateway',
        description: 'publickey',
        weight: 'precedence',
        priority: 'gateway type',
        other: 'algorithm',
      })      
      break
    case 'NAPTR':
      applyMap(obj, {
        weight: 'order',
        priority: 'preference',
        description: 'replacement',
      })
      obj.address = `${obj.flags} ${obj.service} ${obj.regexp}`
      delete obj.flags; delete obj.service; delete obj.regexp
      break
    case 'SSHFP':
      applyMap(obj, {
        address: 'fingerprint',
        weight: 'algorithm',
        priority: 'fptype',
      })
      break
    case 'SRV':
      applyMap(obj, { other: 'port' })
      break
    case 'URI':
      applyMap(obj, { address: 'target' })
      break
  }

  obj.type_id = RR.typeMap[obj.type]
  delete obj.type

  return obj
}

function applyMap (obj, map) {
  for (const [key, value] of Object.entries(map)) {
    obj[key] = obj[value]; delete obj[value]
  }
}
