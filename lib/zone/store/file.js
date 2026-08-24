import FileStore, { resolveCodec } from '../../store/file.js'

import ZoneBase, { canonicalZoneName, ZoneNameConflictError } from './base.js'

const zoneDefaults = { minimum: 3600, ttl: 3600, refresh: 86400, retry: 7200, expire: 1209600 }
let zoneWriteQueue = Promise.resolve()

async function withZoneWriteLock(fn) {
  const previous = zoneWriteQueue
  let release
  zoneWriteQueue = new Promise((resolve) => { release = resolve })
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

function assertZoneNameAvailable(zones, zone, excludeId) {
  const canonical = canonicalZoneName(zone)
  if (zones.some((row) => (
    row.id !== excludeId && row.deleted !== true && canonicalZoneName(row.zone) === canonical
  ))) {
    throw new ZoneNameConflictError(zone)
  }
}

class ZoneRepoFile extends ZoneBase {
  constructor(args = {}) {
    super(args)
    this.file = new FileStore('zone')
  }

  async _load() {
    return this.file.load('zone')
  }

  async _save(zones) {
    return this.file.save('zone', zones)
  }

  _postProcess(row, deletedArg) {
    const r = { ...row }
    r.deleted = Boolean(r.deleted)
    if ([null, undefined].includes(r.description)) r.description = ''
    for (const [f, val] of Object.entries(zoneDefaults)) {
      if ([null, undefined].includes(r[f])) r[f] = val
    }
    if ([null, undefined].includes(r.serial)) r.serial = 0
    // TOML drops null on stringify; restore it on read-back. JSON round-trips
    // null faithfully and needs no such repair.
    if (resolveCodec().ext === 'toml' && r.last_publish === undefined) r.last_publish = null
    if (/00:00:00/.test(r.last_publish)) r.last_publish = null
    if (deletedArg === false) delete r.deleted
    return r
  }

  async create(args) {
    return withZoneWriteLock(async () => {
      const zones = await this._load()
      if (args.id && zones.some((zone) => zone.id === args.id)) return args.id
      if (args.deleted !== true) assertZoneNameAvailable(zones, args.zone)
      zones.push(JSON.parse(JSON.stringify(args)))
      await this._save(zones)
      return args.id
    })
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    const { search, zone_like, description_like, sort_by, sort_dir, limit, offset } = args
    const id = args.id
    const gid = args.gid
    const accessibleIds = Array.isArray(args.accessible_ids) ? args.accessible_ids : []
    const zone = args.zone

    let zones = await this._load()

    // Direct field filters
    if (id !== undefined) zones = zones.filter((z) => z.id === id)
    if (gid !== undefined) {
      const gids = Array.isArray(gid) ? gid : [gid]
      zones = zones.filter((z) => gids.includes(z.gid) || accessibleIds.includes(z.id))
    }
    if (zone !== undefined) zones = zones.filter((z) => z.zone === zone)
    if (deletedArg === false) zones = zones.filter((z) => !z.deleted)
    else if (deletedArg !== undefined) zones = zones.filter((z) => Boolean(z.deleted) === Boolean(deletedArg))

    // Search filters
    if (search) {
      const s = search.trim().toLowerCase()
      zones = zones.filter(
        (z) => z.zone?.toLowerCase().includes(s) || z.description?.toLowerCase().includes(s),
      )
    }
    if (zone_like) {
      const s = zone_like.trim().toLowerCase()
      zones = zones.filter((z) => z.zone?.toLowerCase().includes(s))
    }
    if (description_like) {
      const s = description_like.trim().toLowerCase()
      zones = zones.filter((z) => z.description?.toLowerCase().includes(s))
    }

    // Sort
    const sortKey = sort_by ?? 'zone'
    const desc = sort_dir === 'desc'
    zones.sort((a, b) => {
      const av = String(a[sortKey] ?? '')
      const bv = String(b[sortKey] ?? '')
      return desc ? bv.localeCompare(av) : av.localeCompare(bv)
    })

    // Pagination
    const off = Number.isInteger(offset) ? Math.max(0, offset) : 0
    if (Number.isInteger(limit)) {
      zones = zones.slice(off, off + Math.max(1, limit))
    } else if (off > 0) {
      zones = zones.slice(off)
    }

    return zones.map((z) => this._postProcess(z, deletedArg))
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    const { search, zone_like, description_like } = args
    const id = args.id
    const gid = args.gid
    const accessibleIds = Array.isArray(args.accessible_ids) ? args.accessible_ids : []

    let zones = await this._load()

    if (id !== undefined) zones = zones.filter((z) => z.id === id)
    if (gid !== undefined) {
      const gids = Array.isArray(gid) ? gid : [gid]
      zones = zones.filter((z) => gids.includes(z.gid) || accessibleIds.includes(z.id))
    }
    if (deletedArg === false) zones = zones.filter((z) => !z.deleted)
    else if (deletedArg !== undefined) zones = zones.filter((z) => Boolean(z.deleted) === Boolean(deletedArg))

    if (search) {
      const s = search.trim().toLowerCase()
      zones = zones.filter(
        (z) => z.zone?.toLowerCase().includes(s) || z.description?.toLowerCase().includes(s),
      )
    }
    if (zone_like) {
      const s = zone_like.trim().toLowerCase()
      zones = zones.filter((z) => z.zone?.toLowerCase().includes(s))
    }
    if (description_like) {
      const s = description_like.trim().toLowerCase()
      zones = zones.filter((z) => z.description?.toLowerCase().includes(s))
    }

    return zones.length
  }

  async put(args) {
    if (!args.id) return false
    return withZoneWriteLock(async () => {
      const zones = await this._load()
      const idx = zones.findIndex((z) => z.id === args.id)
      if (idx === -1) return false
      if (args.deleted === false) assertZoneNameAvailable(zones, zones[idx].zone, args.id)

      zones[idx] = { ...zones[idx], ...args }
      await this._save(zones)
      return true
    })
  }

  async delete(args) {
    const zones = await this._load()
    const idx = zones.findIndex((z) => z.id === args.id)
    if (idx === -1) return false

    zones[idx].deleted = args.deleted ?? true
    await this._save(zones)
    return true
  }

  async destroy(args) {
    const zones = await this._load()
    const before = zones.length
    const filtered = zones.filter((z) => z.id !== args.id)
    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }

  // the zone<->nameserver mapping is its own document; a deployment that
  // hasn't created it simply has no NS records to serve
  async nameserversFor(zid) {
    const mappings = await new FileStore('zone_nameserver').load('zone_nameserver')
    const zones = await this._load()
    const nameservers = await new FileStore('nameserver').load('nameserver')

    return mappings
      .filter((m) => m.zid === zid)
      .map((m) => ({
        zone: zones.find((z) => z.id === zid)?.zone,
        name: nameservers.find((n) => n.id === m.nid)?.name,
        ttl: nameservers.find((n) => n.id === m.nid)?.ttl,
      }))
      .filter((row) => row.name !== undefined)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
  }
}

export default ZoneRepoFile
