import { StoreConflictError } from '../../store/error.js'

/**
 * Zone domain class – pure contract, no persistence knowledge.
 *
 * All zone repository classes must extend this class and implement:
 *   get(args)     → object[]
 *   count(args)   → number
 *   create(args, options) → number  (zoneId)
 *   put(args)     → boolean
 *   delete(args)  → boolean
 *   destroy(args) → boolean
 *   nameserversFor(zid) → object[]  ({zone, name, ttl} for the zone's NS)
 *
 * A zone's `nameservers` are the ids of the nameservers that serve it. As in
 * NicTool 2, they are the zone's apex NS set, and the lowest id is the SOA
 * MNAME, so every store keeps them ascending.
 */
class ZoneBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  async get(_args) {
    throw new Error('get() not implemented by this repo')
  }

  async nameserversFor(_zid) {
    throw new Error('nameserversFor() not implemented by this repo')
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
    // noop by default, overridden by repos that need to clean up resources
  }
}

export default ZoneBase

// A loop, as /\.+$/ backtracks quadratically over a run of dots mid-name
export function canonicalZoneName(zone) {
  let end = zone.length
  while (end > 0 && zone[end - 1] === '.') end--
  return zone.slice(0, end).toLowerCase()
}

export function withCanonicalZone(args) {
  return args?.zone === undefined ? args : { ...args, zone: canonicalZoneName(args.zone) }
}

export function zoneNameConflict(zone) {
  return new StoreConflictError('zone', undefined, `zone ${zone} already exists`)
}

export function sortNameservers(ids) {
  return [...new Set((ids ?? []).map(Number))].sort((a, b) => a - b)
}
