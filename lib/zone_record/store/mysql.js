import * as RR from '@nictool/dns-resource-record'
import ZoneRecordBase from './base.js'

import Mysql from '../../mysql.js'
import { mapToDbColumn } from '../../util.js'

const zrDbMap = { id: 'nt_zone_record_id', zid: 'nt_zone_id', owner: 'name' }
const boolFields = ['deleted']
const keepZeroWeightFor = new Set(['SRV', 'URI'])
const keepZeroPriorityFor = new Set(['HTTPS', 'SVCB', 'URI'])

const sortByColumn = { id: 'nt_zone_record_id', owner: 'name', type: 'type_id', ttl: 'ttl' }

function applyZoneRecordSearch(query, params, search) {
  const term = typeof search === 'string' ? search.trim() : ''
  if (!term) return [query, params]
  const nextQuery = `${query}${/\bWHERE\b/.test(query) ? ' AND' : ' WHERE'} (name LIKE ? OR address LIKE ? OR description LIKE ?)`
  const wildcard = `%${term}%`
  return [nextQuery, [...params, wildcard, wildcard, wildcard]]
}

class ZoneRecordMySQL extends ZoneRecordBase {
  constructor() {
    super()
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    const rrArgs = args.ttl === undefined ? { ...args, default: { ttl: 0 } } : args
    new RR[args.type](rrArgs)

    args = objectToDb(args)

    return await Mysql.execute(...Mysql.insert(`nt_zone_record`, mapToDbColumn(args, zrDbMap)))
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false
    if (args.type !== undefined) {
      args.type_id = RR.typeMap[args.type]
      delete args.type
    }

    const search = args.search
    delete args.search

    const hasSort = args.sort_by !== undefined || args.sort_dir !== undefined
    const sortBy = sortByColumn[args.sort_by] ?? 'name'
    const sortDir = args.sort_dir === 'desc' ? 'DESC' : 'ASC'
    delete args.sort_by
    delete args.sort_dir

    const limit = Number.isInteger(args.limit) ? args.limit : undefined
    delete args.limit
    const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0
    delete args.offset
    const sqlLimit = limit === undefined ? '' : ` LIMIT ${Math.max(1, limit)} OFFSET ${offset}`

    const [query, params] = Mysql.select(
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
    )

    let [finalQuery, finalParams] = applyZoneRecordSearch(query, params, search)
    // Order only when sorting or paginating; the id tiebreak keeps LIMIT/OFFSET
    // pages stable when many records share an owner name.
    if (hasSort || limit !== undefined) {
      finalQuery += ` ORDER BY ${sortBy} ${sortDir}, nt_zone_record_id ASC`
    }

    const rows = await Mysql.execute(`${finalQuery}${sqlLimit}`, finalParams)

    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      if (args.deleted === false) delete row.deleted
    }

    const zrObjects = dbToObject(rows)

    return zrObjects
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false
    if (args.type !== undefined) {
      args.type_id = RR.typeMap[args.type]
      delete args.type
    }

    const search = args.search
    for (const k of ['search', 'sort_by', 'sort_dir', 'limit', 'offset']) delete args[k]

    const [query, params] = Mysql.select(
      `SELECT COUNT(*) AS total FROM nt_zone_record`,
      mapToDbColumn(args, zrDbMap),
    )

    const [finalQuery, finalParams] = applyZoneRecordSearch(query, params, search)
    const rows = await Mysql.execute(finalQuery, finalParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone_record`, `nt_zone_record_id=${id}`, mapToDbColumn(args, zrDbMap)),
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
    const r = await Mysql.execute(...Mysql.delete(`nt_zone_record`, { nt_zone_record_id: args.id }))
    return r.affectedRows === 1
  }

  disconnect() {
    this.mysql?.disconnect()
  }
}

export default ZoneRecordMySQL

function dbToObject(rows) {
  rows = JSON.parse(JSON.stringify(rows))

  for (const row of rows) {
    row.owner = row.name
    delete row.name

    row.type = RR.typeMap[row.type_id]
    delete row.type_id

    const map = getMap(row.type)
    if (map) unApplyMap(row, map)

    if ([null, ''].includes(row.description)) delete row.description
    if ([null, '', '0'].includes(row.other)) delete row.other
    if ([null, ''].includes(row.location)) delete row.location
    // Legacy/zero DATETIMEs come back from mysql2 as null or malformed strings
    // (e.g. "undefined 00:00:00"); drop anything that isn't a real date.
    if (row.timestamp == null || Number.isNaN(Date.parse(row.timestamp))) delete row.timestamp

    if (row.weight === null) {
      delete row.weight
    } else if (row.weight === 0 && !keepZeroWeightFor.has(row.type)) {
      delete row.weight
    }

    if (row.priority === null) {
      delete row.priority
    } else if (row.priority === 0 && !keepZeroPriorityFor.has(row.type)) {
      delete row.priority
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
  // map dns-r-r (RFC/IETF) field names to NicTool 2.0 DB fields

  for (const [key, value] of Object.entries(map)) {
    if (Array.isArray(value)) {
      obj[key] = `'${value.map((a) => obj[a]).join("','")}'`
      for (const f of value) {
        delete obj[f]
      }
    } else {
      obj[key] = obj[value]
    }

    delete obj[value]
  }
}

function unApplyMap(obj, map) {
  // map NicTool 2.0 DB fields to dns-r-r (RFC/IETF) field names
  if (obj.type === 'NAPTR') {
    const [flags, service, regexp] = obj.address.slice(1, -1).split("','")
    obj.flags = flags ?? ''
    obj.service = service ?? ''
    obj.regexp = regexp ?? ''
    delete obj.address
    delete map.address
  }
  if (obj.type === 'NSEC3') {
    const [algo, flags, iters, salt, bitmaps, next] = obj.address.slice(1, -1).split("','")
    obj['hash algorithm'] = /^\d+$/.test(algo) ? parseInt(algo) : (algo ?? '')
    obj.flags = /^\d+$/.test(flags) ? parseInt(flags) : (flags ?? '')
    obj.iterations = /^\d+$/.test(iters) ? parseInt(iters) : (iters ?? '')
    obj.salt = salt
    obj['type bit maps'] = bitmaps
    obj['next hashed owner name'] = next
    delete obj.address
    delete map.address
  }
  if (obj.type === 'NSEC3PARAM') {
    const [algo, flags, iters, salt] = obj.address.slice(1, -1).split("','")
    obj['hash algorithm'] = /^\d+$/.test(algo) ? parseInt(algo) : (algo ?? '')
    obj.flags = /^\d+$/.test(flags) ? parseInt(flags) : (flags ?? '')
    obj.iterations = /^\d+$/.test(iters) ? parseInt(iters) : (iters ?? '')
    obj.salt = salt
    delete obj.address
    delete map.address
  }
  if (obj.type === 'SOA') {
    const [one, two, three, four, five, six, seven] = obj.address.slice(1, -1).split("','")
    obj.mname = one
    obj.rname = two
    obj.serial = parseInt(three)
    obj.refresh = parseInt(four)
    obj.retry = parseInt(five)
    obj.expire = parseInt(six)
    obj.minimum = parseInt(seven)
    delete obj.address
    delete map.address
  }

  for (const [key, value] of Object.entries(map)) {
    switch (value) {
      case 'key tag': // DS record
      case 'port': // SRV
      case 'certificate usage': // SMIMEA
      case 'algorithm': // IPSECKEY
      case 'flags': // KEY
      case 'matching type': // TLSA
        obj[value] = parseInt(obj[key])
        break
      default:
        obj[value] = obj[key]
    }
    delete obj[key]
  }
}

// map of NicTool 2.0 fields to RR field names
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
        address: 'publickey',
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
    case 'HTTPS':
      return {
        address: 'target name',
        other: 'params',
      }
    case 'IPSECKEY':
      return {
        address: 'gateway',
        description: 'publickey',
        weight: 'precedence',
        priority: 'gateway type',
        other: 'algorithm',
      }
    case 'KEY':
      return {
        address: 'publickey',
        weight: 'protocol',
        priority: 'algorithm',
        other: 'flags',
      }
    case 'MX':
      return { weight: 'preference', address: 'exchange' }
    case 'NAPTR':
      return {
        weight: 'order',
        priority: 'preference',
        address: ['flags', 'service', 'regexp'],
        description: 'replacement',
      }
    case 'NS':
      return { address: 'dname' }
    case 'NSEC':
      return {
        address: 'next domain',
        description: 'type bit maps',
      }
    case 'NSEC3':
      return {
        address: ['hash algorithm', 'flags', 'iterations', 'salt', 'type bit maps', 'next hashed owner name'],
      }
    case 'NSEC3PARAM':
      return {
        address: ['hash algorithm', 'flags', 'iterations', 'salt'],
      }
    case 'NXT':
      return {
        address: 'next domain',
        description: 'type bit map',
      }
    case 'OPENPGPKEY':
      return { address: 'public key' }
    case 'PTR':
      return { address: 'dname' }
    case 'SMIMEA':
      return {
        address: 'certificate association data',
        weight: 'matching type',
        priority: 'selector',
        other: 'certificate usage',
      }
    case 'SOA':
      return {
        address: ['mname', 'rname', 'serial', 'refresh', 'retry', 'expire', 'minimum'],
      }
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
    case 'TLSA':
      return {
        weight: 'certificate usage',
        priority: 'selector',
        address: 'certificate association data',
        other: 'matching type',
      }
    case 'TXT':
      return { address: 'data' }
    case 'URI':
      return { address: 'target' }
  }
}
