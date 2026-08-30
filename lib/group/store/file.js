import FileStore from '../../store/file.js'
import Permission from '../../permission/index.js'

import GroupBase from './base.js'

class GroupRepoFile extends GroupBase {
  constructor(args = {}) {
    super(args)
    this.file = new FileStore('group')
  }

  async _load() {
    return this.file.load('group')
  }

  async _save(groups) {
    return this.file.save('group', groups)
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

  async subgroupGids(rootGid) {
    const groups = await this._load()
    return [rootGid, ...this._collectSubgroupIds(groups, rootGid)]
  }

  async create(args) {
    args = JSON.parse(JSON.stringify(args))

    if (args.id) {
      const existing = await this.get({ id: args.id })
      if (existing.length === 1) return existing[0].id
    }

    const usable_ns = args.usable_ns ?? []
    delete args.usable_ns

    const groups = await this._load()
    groups.push(args)
    await this._save(groups)

    const gid = args.id
    await Permission.create({
      gid,
      name: `Group ${args.name} perms`,
      nameserver: { usable: Array.isArray(usable_ns) ? usable_ns : [] },
    })
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

    if (Object.keys(args).length > 0) groups[idx] = { ...groups[idx], ...args }

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

export default GroupRepoFile
