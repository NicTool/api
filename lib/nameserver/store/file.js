import FileStore, { nextId } from '../../store/file.js'
import { idConflict } from '../../store/error.js'

import NameserverBase from './base.js'

const boolFields = ['deleted']

// Fields that default to empty string when absent or null
const emptyStringFields = ['description', 'address6', 'remote_login', 'logdir', 'datadir']

class NameserverRepoFile extends NameserverBase {
  constructor(args = {}) {
    super(args)
    this.file = new FileStore('nameserver')
  }

  async _load() {
    return this.file.load('nameserver')
  }

  async _save(nameservers) {
    return this.file.save('nameserver', nameservers)
  }

  _postProcess(row, deletedArg) {
    const r = JSON.parse(JSON.stringify(row))

    for (const b of boolFields) r[b] = Boolean(r[b])
    for (const f of emptyStringFields) {
      if ([null, undefined].includes(r[f])) r[f] = ''
    }

    if (!r.export || typeof r.export !== 'object') r.export = {}
    if ([null, undefined].includes(r.export.interval)) r.export.interval = 0
    if ([null, undefined].includes(r.export.status)) r.export.status = ''
    r.export.serials = Boolean(r.export.serials)

    if (deletedArg === false) delete r.deleted
    return r
  }

  async create(args, options) {
    args = JSON.parse(JSON.stringify(args))

    return this.file.mutate('nameserver', (nameservers, data) => {
      if (args.id !== undefined && nameservers.some((nameserver) => nameserver.id === args.id)) {
        return idConflict('nameserver', args.id, options)
      }

      if (args.id === undefined) args.id = nextId(nameservers, data.last_id, 0xffff)
      data.last_id = Math.max(data.last_id ?? 0, args.id)
      nameservers.push(args)
      return args.id
    })
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

export default NameserverRepoFile
