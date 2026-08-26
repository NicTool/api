import * as RR from '@nictool/dns-resource-record'
import { applyMap, getMap, unApplyMap } from '@nictool/dns-resource-record'
import ZoneRecordBase from './base.js'

import Mysql from '../../mysql.js'
import { mapToDbColumn } from '../../util.js'

const zrDbMap = { id: 'nt_zone_record_id', zid: 'nt_zone_id', owner: 'name' }
const boolFields = ['deleted']
const keepZeroWeightFor = new Set(['SRV', 'URI'])
const keepZeroPriorityFor = new Set(['HTTPS', 'SVCB', 'URI'])

const sortByColumn = {
  id: 'nt_zone_record_id',
  owner: 'name',
  type: 'type_id',
  ttl: 'ttl',
  address: 'address',
  weight: 'weight',
  priority: 'priority',
  other: 'other',
  description: 'description',
  location: 'location',
}

function applyZoneRecordSearch(query, params, search) {
  const term = typeof search === 'string' ? search.trim() : ''
  if (!term) return [query, params]
  const nextQuery = `${query}${/\bWHERE\b/.test(query) ? ' AND' : ' WHERE'} (name LIKE ? OR address LIKE ? OR description LIKE ?)`
  const wildcard = `%${term}%`
  return [nextQuery, [...params, wildcard, wildcard, wildcard]]
}

function applyIdScope(query, params, ids) {
  if (!Array.isArray(ids)) return [query, params]
  const connector = /\bWHERE\b/.test(query) ? ' AND' : ' WHERE'
  if (ids.length === 0) return [`${query}${connector} 1 = 0`, params]
  const placeholders = ids.map(() => '?').join(', ')
  return [
    `${query}${connector} nt_zone_record_id IN (${placeholders})`,
    [...params, ...ids],
  ]
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
    const ids = args.ids
    delete args.ids

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
    ;[finalQuery, finalParams] = applyIdScope(finalQuery, finalParams, ids)
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
    const ids = args.ids
    for (const k of ['search', 'ids', 'sort_by', 'sort_dir', 'limit', 'offset']) delete args[k]

    const [query, params] = Mysql.select(
      `SELECT COUNT(*) AS total FROM nt_zone_record`,
      mapToDbColumn(args, zrDbMap),
    )

    const [finalQuery, finalParams] = applyZoneRecordSearch(query, params, search)
    const [scopedQuery, scopedParams] = applyIdScope(finalQuery, finalParams, ids)
    const rows = await Mysql.execute(scopedQuery, scopedParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    args = JSON.parse(JSON.stringify(args))
    delete args.id
    const current = await this.get({ id })
    if (current.length !== 1) return false

    const type = args.type ?? current[0].type
    const typeChanged = args.type !== undefined && args.type !== current[0].type
    args = objectToDb({ ...args, type })
    if (!typeChanged) delete args.type_id
    if (typeChanged) {
      args = { address: '', weight: null, priority: null, other: null, ...args }
    }

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

// map of NicTool 2.0 fields to RR field names
