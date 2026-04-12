import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import NameserverBase from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const boolFields = ['deleted']

// Fields that default to empty string when absent or null
const emptyStringFields = ['description', 'address6', 'remote_login', 'logdir', 'datadir']

function resolveStorePath(filename) {
  const base = process.env.NICTOOL_DATA_STORE_PATH
  if (base) return path.join(base, filename)
  return path.resolve(__dirname, '../../../conf.d', filename)
}

class NameserverRepoTOML extends NameserverBase {
  constructor(args = {}) {
    super(args)
    this._filePath = resolveStorePath('nameserver.toml')
  }

  async _load() {
    try {
      const str = await fs.readFile(this._filePath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.nameserver) ? data.nameserver : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _save(nameservers) {
    await fs.mkdir(path.dirname(this._filePath), { recursive: true })
    await fs.writeFile(this._filePath, stringify({ nameserver: nameservers }))
  }

  _postProcess(row, deletedArg) {
    const r = JSON.parse(JSON.stringify(row))

    for (const b of boolFields) r[b] = Boolean(r[b])
    for (const f of emptyStringFields) {
      if ([null, undefined].includes(r[f])) r[f] = ''
    }

    // Ensure the nested export object is always present and well-formed.
    // Unlike MySQL (which joins nt_nameserver_export_type), TOML stores the
    // type name inline, so no translation is needed.
    if (!r.export || typeof r.export !== 'object') r.export = {}
    if ([null, undefined].includes(r.export.type)) r.export.type = ''
    if ([null, undefined].includes(r.export.interval)) r.export.interval = 0
    if ([null, undefined].includes(r.export.status)) r.export.status = ''
    r.export.serials = Boolean(r.export.serials)

    if (deletedArg === false) delete r.deleted
    return r
  }

  async create(args) {
    if (args.id) {
      const existing = await this.get({ id: args.id })
      if (existing.length === 1) return existing[0].id
    }

    const nameservers = await this._load()
    nameservers.push(JSON.parse(JSON.stringify(args)))
    await this._save(nameservers)
    return args.id
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    let nameservers = await this._load()

    if (args.id !== undefined) nameservers = nameservers.filter((n) => n.id === args.id)
    if (args.gid !== undefined) nameservers = nameservers.filter((n) => n.gid === args.gid)
    if (args.name !== undefined) nameservers = nameservers.filter((n) => n.name === args.name)
    if (deletedArg === false) nameservers = nameservers.filter((n) => !n.deleted)
    else if (deletedArg !== undefined)
      nameservers = nameservers.filter((n) => Boolean(n.deleted) === Boolean(deletedArg))

    return nameservers.map((n) => this._postProcess(n, deletedArg))
  }

  async put(args) {
    if (!args.id) return false
    const nameservers = await this._load()
    const idx = nameservers.findIndex((n) => n.id === args.id)
    if (idx === -1) return false

    nameservers[idx] = { ...nameservers[idx], ...JSON.parse(JSON.stringify(args)) }
    await this._save(nameservers)
    return true
  }

  async delete(args) {
    const nameservers = await this._load()
    const idx = nameservers.findIndex((n) => n.id === args.id)
    if (idx === -1) return false

    nameservers[idx].deleted = args.deleted ?? true
    await this._save(nameservers)
    return true
  }

  async destroy(args) {
    const nameservers = await this._load()
    const before = nameservers.length
    const filtered = nameservers.filter((n) => n.id !== args.id)
    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }
}

export default NameserverRepoTOML
