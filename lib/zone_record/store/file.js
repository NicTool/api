import FileStore, { nextId } from '../../store/file.js'
import { idConflict } from '../../store/error.js'

import ZoneRecordBase from './base.js'

class ZoneRecordRepoFile extends ZoneRecordBase {
  constructor(args = {}) {
    super(args)
    this.file = new FileStore('zone_record')
  }

  async _load() {
    return this.file.load('zone_record')
  }

  async _save(records) {
    return this.file.save('zone_record', records)
  }

  async create(args, options) {
    args = JSON.parse(JSON.stringify(args))

    if (args.id !== undefined) {
      const existing = [
        ...(await this.get({ id: args.id })),
        ...(await this.get({ id: args.id, deleted: true })),
      ]
      if (existing.length > 0) return idConflict('zone record', args.id, options)
    }

    const records = await this._load()

    if (args.id === undefined) args.id = nextId(records)

    if (args.ttl === undefined) args.ttl = 0

    records.push(args)
    await this._save(records)
    return args.id
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false
    const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''

    let records = await this._load()

    if (args.id !== undefined) records = records.filter((r) => r.id === args.id)
    if (args.zid !== undefined) records = records.filter((r) => r.zid === args.zid)
    if (args.type !== undefined) records = records.filter((r) => r.type === args.type)
    if (deletedArg === false) records = records.filter((r) => !r.deleted)
    else if (deletedArg !== undefined)
      records = records.filter((r) => Boolean(r.deleted) === Boolean(deletedArg))
    if (search)
      records = records.filter((r) =>
        [r.owner, r.address, r.description].some((v) => `${v ?? ''}`.toLowerCase().includes(search)),
      )

    return records.length
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''
    const hasSort = args.sort_by !== undefined || args.sort_dir !== undefined
    const sortBy = ['id', 'owner', 'type', 'ttl'].includes(args.sort_by) ? args.sort_by : 'owner'
    const dir = args.sort_dir === 'desc' ? -1 : 1
    const limit = Number.isInteger(args.limit) ? args.limit : undefined
    const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0

    let records = await this._load()

    if (args.id !== undefined) records = records.filter((r) => r.id === args.id)
    if (args.zid !== undefined) records = records.filter((r) => r.zid === args.zid)
    if (args.type !== undefined) records = records.filter((r) => r.type === args.type)
    if (args.deleted === false) records = records.filter((r) => !r.deleted)
    else if (args.deleted !== undefined)
      records = records.filter((r) => Boolean(r.deleted) === Boolean(args.deleted))
    if (search)
      records = records.filter((r) =>
        [r.owner, r.address, r.description].some((v) => `${v ?? ''}`.toLowerCase().includes(search)),
      )

    // Order only when sorting or paginating; the id tiebreak keeps slices stable.
    if (hasSort || limit !== undefined) {
      records.sort((a, b) => {
        if (a[sortBy] !== b[sortBy]) return a[sortBy] > b[sortBy] ? dir : -dir
        return (a.id ?? 0) - (b.id ?? 0)
      })
    }

    if (limit !== undefined) records = records.slice(offset, offset + limit)

    return records.map((r) => {
      const out = { ...r }
      out.deleted = Boolean(out.deleted)
      if (args.deleted === false) delete out.deleted
      return out
    })
  }

  async put(args) {
    if (!args.id) return false
    const records = await this._load()
    const idx = records.findIndex((r) => r.id === args.id)
    if (idx === -1) return false

    records[idx] = { ...records[idx], ...args }
    await this._save(records)
    return true
  }

  async delete(args) {
    const records = await this._load()
    const idx = records.findIndex((r) => r.id === args.id)
    if (idx === -1) return false

    records[idx].deleted = args.deleted ?? true
    await this._save(records)
    return true
  }

  async destroy(args) {
    const records = await this._load()
    const before = records.length
    const filtered = records.filter((r) => r.id !== args.id)
    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }
}

export default ZoneRecordRepoFile
