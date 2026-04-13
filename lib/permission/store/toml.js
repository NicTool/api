import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import PermissionBase from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveStorePath(filename) {
  const base = process.env.NICTOOL_DATA_STORE_PATH
  if (base) return path.join(base, filename)
  return path.resolve(__dirname, '../../../conf.d', filename)
}

/**
 * TOML permission store.
 *
 * Permissions are stored in one of three places:
 *
 *   1. Inline in user.toml — for permissions tied to an existing user record.
 *      Looked up via users[i].permissions.id === N.
 *
 *   2. Inline in group.toml — group-level permissions created by GroupRepoTOML.
 *      Looked up via groups[i].permissions.id === N.
 *
 *   3. Standalone permission.toml — fallback for permission IDs that reference
 *      users/groups not present in user.toml / group.toml.
 *
 * get({ uid })      → inline permissions of that user
 * get({ gid })      → inline permissions of that group (uid absent)
 * get({ id })       → search user → group → standalone by permissions.id
 * getGroup({ uid }) → permissions of the group the user belongs to
 */
class PermissionRepoTOML extends PermissionBase {
  constructor(args = {}) {
    super(args)
    this._userPath = resolveStorePath('user.toml')
    this._groupPath = resolveStorePath('group.toml')
    this._standaloneFilePath = resolveStorePath('permission.toml')
  }

  // ---------------------------------------------------------------------------
  // Raw file I/O — users
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

  // ---------------------------------------------------------------------------
  // Raw file I/O — groups
  // ---------------------------------------------------------------------------

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
  // Raw file I/O — standalone permission.toml
  // ---------------------------------------------------------------------------

  async _loadStandalone() {
    try {
      const str = await fs.readFile(this._standaloneFilePath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.permission) ? data.permission : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _saveStandalone(permissions) {
    await fs.mkdir(path.dirname(this._standaloneFilePath), { recursive: true })
    await fs.writeFile(this._standaloneFilePath, stringify({ permission: permissions }))
  }

  // ---------------------------------------------------------------------------
  // Post-processing
  // ---------------------------------------------------------------------------

  _postProcess(perm, deletedArg) {
    if (!perm) return undefined
    const r = JSON.parse(JSON.stringify(perm))
    // uid/gid are internal storage hints; never expose them in the response
    delete r.uid
    delete r.gid
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

      if (idx !== -1) {
        // Store inline in user.toml using the actual permission data from args
        if (!users[idx].permissions) {
          const perm = JSON.parse(JSON.stringify(args))
          perm.id = uid
          if (!perm.user) perm.user = {}
          perm.user.id = uid
          if (!perm.group) perm.group = {}
          perm.group.id = gid ?? users[idx].gid
          users[idx].permissions = perm
        }
        await this._saveUsers(users)
        return users[idx].permissions.id
      }

      // User not found — fall through to standalone storage
    }

    if (gid !== undefined && uid === undefined) {
      const groups = await this._loadGroups()
      const idx = groups.findIndex((g) => g.id === gid)

      if (idx !== -1) {
        // Store inline in group.toml
        if (!groups[idx].permissions) {
          const perm = JSON.parse(JSON.stringify(args))
          perm.id = gid
          if (!perm.group) perm.group = {}
          perm.group.id = gid
          groups[idx].permissions = perm
        }
        await this._saveGroups(groups)
        return groups[idx].permissions.id
      }

      // Group not found — fall through to standalone storage
    }

    // Standalone fallback: neither user nor group record found
    const permId = args.id ?? uid ?? gid
    if (permId === undefined) return undefined

    const perms = await this._loadStandalone()
    if (!perms.find((p) => p.id === permId)) {
      const perm = { ...args, id: permId }
      if (uid !== undefined) perm.uid = uid
      if (gid !== undefined) perm.gid = gid
      perms.push(perm)
      await this._saveStandalone(perms)
    }
    return permId
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
      // Search user.toml by permissions.id.
      // NOTE: group.toml is intentionally NOT searched here — group permissions are
      // accessed via { gid }.  Searching groups would cause false positives after a
      // user permission is destroyed, because user and group share the same numeric
      // id space (both user 4096 and group 4096 set permissions.id = 4096).
      const users = await this._loadUsers()
      const user = users.find((u) => u.permissions?.id === args.id)
      if (user?.permissions) {
        const perm = this._postProcess(user.permissions, deletedArg)
        if (deletedArg === true && perm.deleted !== true) return undefined
        return perm
      }

      // Check standalone permission.toml
      const perms = await this._loadStandalone()
      const found = perms.find((p) => p.id === args.id)
      if (found) {
        const isDeleted = Boolean(found.deleted)
        const wantDeleted = Boolean(deletedArg)
        if (isDeleted !== wantDeleted) return undefined
        return this._postProcess(found, deletedArg)
      }
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

    // Check standalone
    const perms = await this._loadStandalone()
    const pidx = perms.findIndex((p) => p.id === id)
    if (pidx !== -1) {
      perms[pidx] = deepMerge(perms[pidx], args)
      await this._saveStandalone(perms)
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

    // Check standalone
    const perms = await this._loadStandalone()
    const pidx = perms.findIndex((p) => p.id === args.id)
    if (pidx !== -1) {
      perms[pidx].deleted = deletedVal
      await this._saveStandalone(perms)
      return true
    }

    return false
  }

  disconnect() {
    // noop
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

    // Check standalone
    const perms = await this._loadStandalone()
    const before = perms.length
    const filtered = perms.filter((p) => p.id !== args.id)
    if (filtered.length < before) {
      await this._saveStandalone(filtered)
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
