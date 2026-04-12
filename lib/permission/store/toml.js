import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import PermissionBase from './base.js'

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

/**
 * TOML permission store — a facade over user.toml and group.toml.
 *
 * Permissions are stored inline in each user/group record rather than in a
 * separate file.  This store reads and writes those files directly via
 * fs.readFile / fs.writeFile (never via the User or Group modules) to avoid
 * circular import cycles.
 *
 *   get({ uid })  → inline permissions of that user
 *   get({ gid })  → inline permissions of that group (uid absent)
 *   get({ id })   → search user.toml first, then group.toml by permissions.id
 *   getGroup({ uid }) → permissions of the group the user belongs to
 */
class PermissionRepoTOML extends PermissionBase {
  constructor(args = {}) {
    super(args)
    this._userPath = resolveStorePath('user.toml')
    this._groupPath = resolveStorePath('group.toml')
  }

  // ---------------------------------------------------------------------------
  // Raw file I/O
  // ---------------------------------------------------------------------------

  async _loadUsers() {
    try {
      const str = await fs.readFile(this._userPath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.user) ? data.user : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _saveUsers(users) {
    await fs.mkdir(path.dirname(this._userPath), { recursive: true })
    await fs.writeFile(this._userPath, stringify({ user: users }))
  }

  async _loadGroups() {
    try {
      const str = await fs.readFile(this._groupPath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.group) ? data.group : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _saveGroups(groups) {
    await fs.mkdir(path.dirname(this._groupPath), { recursive: true })
    await fs.writeFile(this._groupPath, stringify({ group: groups }))
  }

  // ---------------------------------------------------------------------------
  // Post-processing
  // ---------------------------------------------------------------------------

  _postProcess(perm, deletedArg) {
    if (!perm) return undefined
    const r = JSON.parse(JSON.stringify(perm))
    r.deleted = Boolean(r.deleted)
    if (r.nameserver && !Array.isArray(r.nameserver.usable)) r.nameserver.usable = []
    if (deletedArg === false) delete r.deleted
    return r
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(args) {
    args = JSON.parse(JSON.stringify(args))
    const uid = args.uid ?? args.user?.id
    const gid = args.gid ?? args.group?.id
    delete args.uid
    delete args.gid

    if (uid !== undefined) {
      const users = await this._loadUsers()
      const idx = users.findIndex((u) => u.id === uid)
      if (idx === -1) return undefined

      if (!users[idx].permissions) {
        const usable = Array.isArray(args.nameserver?.usable) ? args.nameserver.usable : []
        users[idx].permissions = {
          ...JSON.parse(JSON.stringify(defaultPermissions)),
          id: uid,
          inherit: false,
          user: { id: uid, create: false, write: false, delete: false },
          group: { id: gid ?? users[idx].gid, create: false, write: false, delete: false },
          nameserver: { usable, create: false, write: false, delete: false },
        }
      }
      await this._saveUsers(users)
      return users[idx].permissions.id
    }

    if (gid !== undefined) {
      const groups = await this._loadGroups()
      const idx = groups.findIndex((g) => g.id === gid)
      if (idx === -1) return undefined

      if (!groups[idx].permissions) {
        const usable = Array.isArray(args.nameserver?.usable) ? args.nameserver.usable : []
        groups[idx].permissions = {
          ...JSON.parse(JSON.stringify(defaultPermissions)),
          id: gid,
          name: args.name,
          inherit: false,
          user: { id: gid, create: false, write: false, delete: false },
          group: { id: gid, create: false, write: false, delete: false },
          nameserver: { usable, create: false, write: false, delete: false },
        }
      }
      await this._saveGroups(groups)
      return groups[idx].permissions.id
    }

    return undefined
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    if (args.uid !== undefined) {
      const users = await this._loadUsers()
      const user = users.find((u) => u.id === args.uid)
      if (!user?.permissions) return undefined
      const perm = this._postProcess(user.permissions, deletedArg)
      if (deletedArg === true && perm.deleted !== true) return undefined
      return perm
    }

    if (args.gid !== undefined) {
      // group-level lookup: no uid qualifier
      const groups = await this._loadGroups()
      const group = groups.find((g) => g.id === args.gid)
      if (!group?.permissions) return undefined
      const perm = this._postProcess(group.permissions, deletedArg)
      if (deletedArg === true && perm.deleted !== true) return undefined
      return perm
    }

    if (args.id !== undefined) {
      // Search user.toml first (user and group ids can collide)
      const users = await this._loadUsers()
      const user = users.find((u) => u.permissions?.id === args.id)
      if (user?.permissions) return this._postProcess(user.permissions, deletedArg)

      const groups = await this._loadGroups()
      const group = groups.find((g) => g.permissions?.id === args.id)
      if (group?.permissions) return this._postProcess(group.permissions, deletedArg)
    }

    return undefined
  }

  async getGroup(args) {
    const users = await this._loadUsers()
    const user = users.find((u) => u.id === args.uid && !u.deleted)
    if (!user) return undefined

    const groups = await this._loadGroups()
    const group = groups.find((g) => g.id === user.gid)
    if (!group?.permissions) return undefined

    const deletedArg = args.deleted ?? false
    return this._postProcess(group.permissions, deletedArg)
  }

  async put(args) {
    args = JSON.parse(JSON.stringify(args))
    if (!args.id) return false
    const id = args.id
    delete args.id

    const users = await this._loadUsers()
    const uidx = users.findIndex((u) => u.permissions?.id === id)
    if (uidx !== -1) {
      users[uidx].permissions = deepMerge(users[uidx].permissions, args)
      await this._saveUsers(users)
      return true
    }

    const groups = await this._loadGroups()
    const gidx = groups.findIndex((g) => g.permissions?.id === id)
    if (gidx !== -1) {
      groups[gidx].permissions = deepMerge(groups[gidx].permissions, args)
      await this._saveGroups(groups)
      return true
    }

    return false
  }

  async delete(args) {
    if (!args.id) return false
    const deletedVal = args.deleted ?? true

    const users = await this._loadUsers()
    const uidx = users.findIndex((u) => u.permissions?.id === args.id)
    if (uidx !== -1) {
      users[uidx].permissions.deleted = deletedVal
      await this._saveUsers(users)
      return true
    }

    const groups = await this._loadGroups()
    const gidx = groups.findIndex((g) => g.permissions?.id === args.id)
    if (gidx !== -1) {
      groups[gidx].permissions.deleted = deletedVal
      await this._saveGroups(groups)
      return true
    }

    return false
  }

  async destroy(args) {
    if (!args.id) return false

    const users = await this._loadUsers()
    const uidx = users.findIndex((u) => u.permissions?.id === args.id)
    if (uidx !== -1) {
      delete users[uidx].permissions
      await this._saveUsers(users)
      return true
    }

    const groups = await this._loadGroups()
    const gidx = groups.findIndex((g) => g.permissions?.id === args.id)
    if (gidx !== -1) {
      delete groups[gidx].permissions
      await this._saveGroups(groups)
      return true
    }

    return false
  }
}

// Recursively merge source into a deep clone of target.
// Arrays are replaced (not concatenated).
function deepMerge(target, source) {
  const result = JSON.parse(JSON.stringify(target))
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object'
    ) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

export default PermissionRepoTOML
