import * as RR from '@nictool/dns-resource-record'

import { StoreInvalidError } from '../../store/error.js'

/**
 * Zone Record domain class – pure contract, no persistence knowledge.
 *
 * All zone repository classes must extend this class and implement:
 *   get(args)     → object[]
 *   count(args)   → number
 *   create(args, options) → number  (zoneId)
 *   put(args)     → boolean
 *   delete(args)  → boolean
 *   destroy(args) → boolean
 */
class ZoneRecordBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  async get(_args) {
    throw new Error('get() not implemented by this repo')
  }

  async count(_args) {
    throw new Error('count() not implemented by this repo')
  }

  async create(_args, _options) {
    throw new Error('create() not implemented by this repo')
  }

  async put(_args) {
    throw new Error('put() not implemented by this repo')
  }

  async delete(_args) {
    throw new Error('delete() not implemented by this repo')
  }

  async destroy(_args) {
    throw new Error('destroy() not implemented by this repo')
  }

  disconnect() {
    // noop by default
  }
}

export default ZoneRecordBase

export function rdataFields(type) {
  return (RR[type]?.rdataFields ?? ['address']).map((f) => (Array.isArray(f) ? f[0] : f))
}

// what a type change takes off the record: the old type's rdata, and the raw
// columns a legacy row can hold without its type mapping them
function retiredFields(type) {
  return [...rdataFields(type), 'weight', 'priority', 'other']
}

// A type change drops the old type's rdata: what is stored, so the new type
// doesn't inherit it, and what the caller sends back with a whole record, so
// it doesn't return. Fields the new type uses stay as the caller sent them.
export function mergeChanges(current, changes) {
  const type = changes.type ?? current.type
  if (type === current.type) return { ...current, ...changes }

  const retired = retiredFields(current.type)
  const merged = { ...current }
  for (const f of retired) delete merged[f]
  const target = { ...merged, ...changes, type }
  const used = new Set(rdataFields(type))
  for (const f of retired) if (!used.has(f)) delete target[f]
  return target
}

export function checkRecord(record) {
  if (RR.typeMap[record.type] === undefined) throw new StoreInvalidError(`unknown type ${record.type}`)
  try {
    new RR[record.type](record)
  } catch (err) {
    throw new StoreInvalidError(err.message.split('\n')[0])
  }
  // packed fields must come back out of their shared column unchanged
  const map = RR.getMap(record.type)
  const packed = Object.values(map ?? {})
    .filter(Array.isArray)
    .flat()
  if (packed.length) {
    const copy = { ...record }
    RR.applyMap(copy, map)
    RR.unApplyMap(copy, map)
    const garbled = packed.find((f) => String(copy[f] ?? '') !== String(record[f] ?? ''))
    if (garbled) throw new StoreInvalidError(`${record.type}: ${garbled} can't be stored as given`)
  }
  // dns-resource-record 1.x accepts an empty TXT data or CAA value, which no read accepts
  const main = RR.getMap(record.type)?.address ?? 'address'
  if (typeof main === 'string' && [undefined, null, ''].includes(record[main])) {
    throw new StoreInvalidError(`${record.type}: ${main} is required`)
  }
}

// A type change, or a change to fields packed into one column, must leave a
// valid record. The placeholder owner lets a legacy relative owner through.
export function checkPut(fromType, record, changes) {
  const packed = Object.values(RR.getMap(record.type) ?? {})
    .filter(Array.isArray)
    .flat()
  if (record.type === fromType && !packed.some((f) => f in changes)) return
  checkRecord({ ...record, owner: 'put.invalid.', ttl: record.ttl ?? 0 })
}
