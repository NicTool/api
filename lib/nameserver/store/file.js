import FileStore, { claimId, destroyMatch, removeRows, serialize } from '../../store/file.js'
import { idConflict } from '../../store/error.js'

import NameserverBase, { nameserverInUse } from './base.js'

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

    return this.file.mutate('nameserver', (nameservers, data, keep) => {
      if (args.id !== undefined && nameservers.some((nameserver) => nameserver.id === args.id)) {
        return keep(idConflict('nameserver', args.id, options))
      }

      args.id = claimId(nameservers, data, args.id, 0xffff)
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
    return this._write(args.id, JSON.parse(JSON.stringify(args)))
  }

  async delete(args) {
    return this._write(args.id, { deleted: args.deleted ?? true })
  }

  // Zone writes check their nameservers under the same key.
  async _write(id, changes) {
    return serialize('zone nameservers', () =>
      this.file.mutate('nameserver', async (nameservers) => {
        const idx = nameservers.findIndex((n) => n.id === id)
        if (idx === -1) return false
        if (changes.deleted) {
          const zones = await new FileStore('zone').load('zone')
          if (zones.some((z) => !z.deleted && (z.nameservers ?? []).map(Number).includes(id))) {
            throw nameserverInUse(id)
          }
        }
        nameservers[idx] = { ...nameservers[idx], ...changes }
        return true
      }),
    )
  }

  async destroy(args) {
    const match = destroyMatch(args, ['id', 'gid'])
    return this.file.mutate('nameserver', (nameservers) => removeRows(nameservers, match) > 0)
  }
}

export default NameserverRepoFile
