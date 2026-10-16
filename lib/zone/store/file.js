import FileStore, { claimId, removeRows, resolveCodec } from '../../store/file.js'
import { idConflict } from '../../store/error.js'

import ZoneBase, { canonicalZoneName, zoneNameConflict } from './base.js'

const zoneDefaults = { minimum: 3600, ttl: 3600, refresh: 86400, retry: 7200, expire: 1209600 }

function assertZoneNameAvailable(zones, zone, excludeId) {
  const canonical = canonicalZoneName(zone)
  const taken = zones.some(
    (z) =>
      (excludeId === undefined || z.id !== excludeId) &&
      !z.deleted &&
      canonicalZoneName(z.zone) === canonical,
  )
  if (taken) throw zoneNameConflict(zone)
}

class ZoneRepoFile extends ZoneBase {
  constructor(args = {}) {
    super(args)
    this.file = new FileStore('zone')
  }

  async _load() {
    return this.file.load('zone')
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

  async create(args, options) {
    args = JSON.parse(JSON.stringify(args))

    return this.file.mutate('zone', (zones, data, keep) => {
      if (args.id !== undefined && zones.some((zone) => zone.id === args.id)) {
        return keep(idConflict('zone', args.id, options))
      }
      if (!args.deleted) assertZoneNameAvailable(zones, args.zone)

      args.id = claimId(zones, data, args.id)
      zones.push(args)
      return args.id
    })
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    const { search, zone_like, description_like, sort_by, sort_dir, limit, offset } = args
    const id = args.id
    const gid = args.gid
    const zone = args.zone

    let zones = await this._load()

    // Direct field filters
    if (id !== undefined) zones = zones.filter((z) => z.id === id)
    if (Array.isArray(gid)) zones = zones.filter((z) => gid.includes(z.gid))
    else if (gid !== undefined) zones = zones.filter((z) => z.gid === gid)
    if (zone !== undefined) zones = zones.filter((z) => canonicalZoneName(z.zone) === zone)
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
    const zone = args.zone

    let zones = await this._load()

    if (id !== undefined) zones = zones.filter((z) => z.id === id)
    if (zone !== undefined) zones = zones.filter((z) => canonicalZoneName(z.zone) === zone)
    if (Array.isArray(gid)) zones = zones.filter((z) => gid.includes(z.gid))
    else if (gid !== undefined) zones = zones.filter((z) => z.gid === gid)
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
    return this.file.mutate('zone', (zones) => {
      const idx = zones.findIndex((z) => z.id === args.id)
      if (idx === -1) return false

      const changes = JSON.parse(JSON.stringify(args))
      const next = { ...zones[idx], ...changes }
      const renamesOrRestores = changes.zone !== undefined || Boolean(zones[idx].deleted)
      if (renamesOrRestores && !next.deleted) assertZoneNameAvailable(zones, next.zone, next.id)
      zones[idx] = next
      return true
    })
  }

  async delete(args) {
    if (args.deleted === false || args.deleted === 0) return this.put({ id: args.id, deleted: false })
    return this.file.mutate('zone', (zones) => {
      const row = zones.find((z) => z.id === args.id)
      if (!row) return false
      row.deleted = args.deleted ?? true
      return true
    })
  }

  async destroy(args) {
    return this.file.mutate('zone', (zones) => removeRows(zones, (z) => z.id === args.id) > 0)
  }

  async nameserversFor(zid) {
    const zone = (await this._load()).find((z) => z.id === zid)
    if (!zone) return []
    const mappings = await new FileStore('zone_nameserver').load('zone_nameserver')
    const nameservers = await new FileStore('nameserver').load('nameserver')

    return mappings
      .filter((m) => m.zid === zid)
      .map((m) => ({
        zone: zone.zone,
        name: nameservers.find((n) => n.id === m.nid)?.name,
        ttl: nameservers.find((n) => n.id === m.nid)?.ttl,
      }))
      .filter((row) => row.name !== undefined)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
  }
}

export default ZoneRepoFile
