import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import GroupBase from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const defaultPermissions = {
  inherit: false,
  self_write: false,
  group: { create: false, write: false, delete: false },
  nameserver: { usable: [], create: false, write: false, delete: false },
  zone: { create: false, write: false, delete: false, delegate: false },
  zonerecord: { create: false, write: false, delete: false, delegate: false },
  user: { create: false, write: false, delete: false },
}

function resolveStorePath(filename) {
  const base = process.env.NICTOOL_DATA_STORE_PATH
  if (base) return path.join(base, filename)
  return path.resolve(__dirname, '../../../conf.d', filename)
}

class GroupRepoTOML extends GroupBase {
  constructor(args = {}) {
    super(args)
    this._filePath = resolveStorePath('group.toml')
  }

  async _load() {
    try {
      const str = await fs.readFile(this._filePath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.group) ? data.group : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _save(groups) {
    await fs.mkdir(path.dirname(this._filePath), { recursive: true })
    await fs.writeFile(this._filePath, stringify({ group: groups }))
  }

  _postProcess(row, deletedArg) {
    const r = JSON.parse(JSON.stringify(row))
    r.deleted = Boolean(r.deleted)
    if (r.permissions?.nameserver && !Array.isArray(r.permissions.nameserver.usable)) {
      r.permissions.nameserver.usable = []
    }
    if (deletedArg === false) delete r.deleted
    return r
  }

  // BFS over parent_gid relationships to collect all descendant group ids.
  _collectSubgroupIds(groups, gid) {
    const ids = []
    const queue = [gid]
    while (queue.length) {
      const cur = queue.shift()
      for (const g of groups) {
        if (g.parent_gid === cur && !ids.includes(g.id)) {
          ids.push(g.id)
          queue.push(g.id)
        }
      }
    }
    return ids
  }

  async create(args) {
    args = JSON.parse(JSON.stringify(args))

    if (args.id) {
      const existing = await this.get({ id: args.id })
      if (existing.length === 1) return existing[0].id
    }

    const usable_ns = args.usable_ns ?? []
    delete args.usable_ns

    const gid = args.id
    args.permissions = {
      ...JSON.parse(JSON.stringify(defaultPermissions)),
      id: gid,
      name: `Group ${args.name} perms`,
      user: { id: gid, create: false, write: false, delete: false },
      group: { id: gid, create: false, write: false, delete: false },
      nameserver: {
        usable: Array.isArray(usable_ns) ? usable_ns : [],
        create: false,
        write: false,
        delete: false,
      },
    }

    const groups = await this._load()
    groups.push(args)
    await this._save(groups)
    return gid
  }

  async get(args_orig) {
    const args = JSON.parse(JSON.stringify(args_orig))
    const deletedArg = args.deleted ?? false
    const include_subgroups = args.include_subgroups === true

    let groups = await this._load()

    if (args.id !== undefined) {
      if (include_subgroups) {
        const subIds = this._collectSubgroupIds(groups, args.id)
        const allIds = [args.id, ...subIds]
        groups = groups.filter((g) => allIds.includes(g.id))
      } else {
        groups = groups.filter((g) => g.id === args.id)
      }
    }

    if (args.parent_gid !== undefined) groups = groups.filter((g) => g.parent_gid === args.parent_gid)
    if (args.name !== undefined) groups = groups.filter((g) => g.name === args.name)

    if (deletedArg === false) groups = groups.filter((g) => !g.deleted)
    else if (deletedArg !== undefined)
      groups = groups.filter((g) => Boolean(g.deleted) === Boolean(deletedArg))

    return groups.map((g) => this._postProcess(g, deletedArg))
  }

  async put(args) {
    if (!args.id) return false
    args = JSON.parse(JSON.stringify(args))
    const id = args.id
    delete args.id

    const usable_ns = args.usable_ns
    delete args.usable_ns

    const groups = await this._load()
    const idx = groups.findIndex((g) => g.id === id)
    if (idx === -1) return false

    if (usable_ns !== undefined && groups[idx].permissions) {
      groups[idx].permissions.nameserver = {
        ...groups[idx].permissions.nameserver,
        usable: Array.isArray(usable_ns) ? usable_ns : [],
      }
    }

    if (Object.keys(args).length > 0) {
      groups[idx] = { ...groups[idx], ...args }
    }

    await this._save(groups)
    return true
  }

  async delete(args) {
    const groups = await this._load()
    const idx = groups.findIndex((g) => g.id === args.id)
    if (idx === -1) return false

    groups[idx].deleted = args.deleted ?? true
    await this._save(groups)
    return true
  }

  async destroy(args) {
    const groups = await this._load()
    const before = groups.length
    const filtered = groups.filter((g) => g.id !== args.id)
    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }
}

export default GroupRepoTOML
