import * as RR from '@nictool/dns-resource-record'
import { applyMap, getMap, unApplyMap } from '@nictool/dns-resource-record'
import ZoneRecordBase, { checkPut, checkRecord, retiredFields } from './base.js'

import Mysql from '../../mysql.js'
import { idConflict, StoreConflictError } from '../../store/error.js'
import { mapToDbColumn } from '../../util.js'

const zrDbMap = { id: 'nt_zone_record_id', zid: 'nt_zone_id', owner: 'name' }
// what put() may write; a field the type doesn't map stays out of the SET
const columns = new Set([
  'zid',
  'owner',
  'ttl',
  'description',
  'type_id',
  'address',
  'weight',
  'priority',
  'other',
  'location',
  'timestamp',
  'deleted',
])
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

  async create(args, options) {
    if (args.id !== undefined) {
      const g = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (g.length > 0) return idConflict('zone record', args.id, options)
    }

    checkRecord(args.ttl === undefined ? { ...args, default: { ttl: 0 } } : args)

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
    const { id, ...changes } = args
    const [current] = [...(await this.get({ id })), ...(await this.get({ id, deleted: true }))]
    if (!current) return false

    const type = changes.type ?? current.type
    const merged = { ...current }
    if (type !== current.type) for (const f of retiredFields(current.type)) delete merged[f]
    const target = { ...merged, ...changes, type }
    checkPut(current.type, target, changes)
    const before = objectToDb(current)
    // Several fields can share a column, so pack the whole merged record.
    const after = objectToDb(target)
    if (type !== current.type) {
      for (const col of [
        'address',
        'weight',
        'priority',
        'other',
        ...Object.keys(getMap(current.type)),
        ...Object.keys(getMap(type)),
      ]) {
        if (after[col] === undefined) after[col] = col === 'address' ? '' : null
      }
    }

    // only changed columns, so concurrent edits of different columns both land;
    // a type change writes every rdata column, so none keeps the old type's rdata
    const rdataColumns =
      type === current.type
        ? new Set()
        : new Set([
            'type_id',
            'address',
            'weight',
            'priority',
            'other',
            ...Object.keys(getMap(current.type)),
            ...Object.keys(getMap(type)),
          ])
    const row = {}
    for (const [col, value] of Object.entries(after)) {
      if (value === undefined || !columns.has(col)) continue
      if (rdataColumns.has(col) || JSON.stringify(value) !== JSON.stringify(before[col])) row[col] = value
    }
    if (Object.keys(row).length === 0) return false

    // A type change in between would leave this rdata on the wrong type, so the
    // update only applies to the type it was merged against.
    const known = before.type_id !== undefined
    const [sql, params] = Mysql.update(
      `nt_zone_record`,
      known ? `nt_zone_record_id=? AND type_id=?` : `nt_zone_record_id=?`,
      mapToDbColumn(row, zrDbMap),
    )
    const r = await Mysql.execute(sql, known ? [...params, id, before.type_id] : [...params, id])
    if (r.affectedRows === 0) {
      const [still] = await Mysql.execute('SELECT 1 FROM nt_zone_record WHERE nt_zone_record_id=?', [id])
      if (!still) return false
      throw new StoreConflictError('zone record', id, `zone record ${id} changed during the update`)
    }
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
    return this.mysql?.disconnect()
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
    // a NULL column read into an RR field means the field is absent
    for (const key of Object.keys(row)) if (row[key] === null) delete row[key]

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
