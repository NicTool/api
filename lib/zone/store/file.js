import FileStore, { nextId, resolveCodec } from '../../store/file.js'
import { idConflict } from '../../store/error.js'

import ZoneBase from './base.js'

const zoneDefaults = { minimum: 3600, ttl: 3600, refresh: 86400, retry: 7200, expire: 1209600 }

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

  async create(args, options) {
    args = JSON.parse(JSON.stringify(args))

    if (args.id !== undefined) {
      const existing = [
        ...(await this.get({ id: args.id })),
        ...(await this.get({ id: args.id, deleted: true })),
      ]
      if (existing.length > 0) return idConflict('zone', args.id, options)
    }

    const zones = await this._load()
    if (args.id === undefined) args.id = nextId(zones)
    zones.push(args)
    await this._save(zones)
    return args.id
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

    let zones = await this._load()

    if (id !== undefined) zones = zones.filter((z) => z.id === id)
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
    const zones = await this._load()
    const idx = zones.findIndex((z) => z.id === args.id)
    if (idx === -1) return false

    zones[idx] = { ...zones[idx], ...args }
    await this._save(zones)
    return true
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
}

export default ZoneRepoFile
