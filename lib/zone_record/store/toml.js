import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveStorePath(filename) {
  const base = process.env.NICTOOL_DATA_STORE_PATH
  if (base) return path.join(base, filename)
  return path.resolve(__dirname, '../../../conf.d', filename)
}

class ZoneRecordRepoTOML {
  constructor() {
    this._filePath = resolveStorePath('zone_record.toml')
  }

  async _load() {
    try {
      const str = await fs.readFile(this._filePath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.zone_record) ? data.zone_record : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _save(records) {
    await fs.mkdir(path.dirname(this._filePath), { recursive: true })
    await fs.writeFile(this._filePath, stringify({ zone_record: records }))
  }

  async create(args) {
    if (args.id) {
      const existing = await this.get({ id: args.id })
      if (existing.length === 1) return existing[0].id
    }

    const records = await this._load()
    records.push(JSON.parse(JSON.stringify(args)))
    await this._save(records)
    return args.id
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    let records = await this._load()

    if (args.id !== undefined) records = records.filter((r) => r.id === args.id)
    if (args.zid !== undefined) records = records.filter((r) => r.zid === args.zid)
    if (args.type !== undefined) records = records.filter((r) => r.type === args.type)
    if (args.deleted === false) records = records.filter((r) => !r.deleted)
    else if (args.deleted !== undefined) records = records.filter((r) => Boolean(r.deleted) === Boolean(args.deleted))

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

export default ZoneRecordRepoTOML
