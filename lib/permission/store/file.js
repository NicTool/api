import FileStore from '../../store/file.js'

import PermissionBase from './base.js'

/**
 * File-backed permission store (JSON or TOML, per store.type).
 *
 * Permissions are stored in one of three places:
 *
 *   1. Inline in the user file — for permissions tied to an existing user
 *      record. Looked up via users[i].permissions.id === N.
 *
 *   2. Inline in the group file — group-level permissions created by the group
 *      store. Looked up via groups[i].permissions.id === N.
 *
 *   3. Standalone permission file — fallback for permission IDs that reference
 *      users/groups not present in the user / group files.
 *
 * get({ uid })      → inline permissions of that user
 * get({ gid })      → inline permissions of that group (uid absent)
 * get({ id })       → search user → standalone → group by permissions.id
 * getGroup({ uid }) → permissions of the group the user belongs to
 */
class PermissionRepoFile extends PermissionBase {
  constructor(args = {}) {
    super(args)
    this.userFile = new FileStore('user')
    this.groupFile = new FileStore('group')
    this.standaloneFile = new FileStore('permission')
  }

  async _loadUsers() {
    return this.userFile.load('user')
  }

  async _saveUsers(users) {
    return this.userFile.save('user', users)
  }

  async _loadGroups() {
    return this.groupFile.load('group')
  }

  async _saveGroups(groups) {
    return this.groupFile.save('group', groups)
  }

  async _loadStandalone() {
    return this.standaloneFile.load('permission')
  }

  async _saveStandalone(permissions) {
    return this.standaloneFile.save('permission', permissions)
  }

  async _nextId() {
    const [users, groups, standalone] = await Promise.all([
      this._loadUsers(),
      this._loadGroups(),
      this._loadStandalone(),
    ])
    return (
      [...users, ...groups]
        .map((row) => row.permissions?.id)
        .concat(standalone.map((row) => row.id))
        .reduce((max, id) => Math.max(max, id ?? 0), 0) + 1
    )
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
    for (const field of ['inherit', 'self_write', 'deleted']) r[field] = Boolean(r[field])
    if (r.user && r.user.id === undefined) r.user.id = null
    if (r.group && r.group.id === undefined) r.group.id = null
    if (r.nameserver && !Array.isArray(r.nameserver.usable)) r.nameserver.usable = []
    if (deletedArg === false) delete r.deleted
    return r
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(args) {
    args = expandFlatPermissions(JSON.parse(JSON.stringify(args)))
    const uid = args.uid ?? args.user?.id
    const gid = args.gid ?? args.group?.id
    delete args.uid
    delete args.gid

    if (uid !== undefined) {
      const users = await this._loadUsers()
      const idx = users.findIndex((u) => u.id === uid)

      if (idx !== -1) {
        // Store inline in user.toml using the actual permission data from args;
        // a soft-deleted row is replaced, as the mysql store does
        const current = users[idx].permissions
        if (!current || current.deleted) {
          const perm = deepMerge(permissionDefaults(uid, gid ?? users[idx].gid), args)
          perm.id = current?.id ?? args.id ?? (await this._nextId())
          perm.user.id = uid
          perm.group.id = gid ?? users[idx].gid
          perm.deleted = false
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
        const current = groups[idx].permissions
        if (!current || current.deleted) {
          const perm = deepMerge(permissionDefaults(null, gid), args)
          perm.id = current?.id ?? args.id ?? (await this._nextId())
          perm.group.id = gid
          perm.deleted = false
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
    const pidx = perms.findIndex((p) => p.id === permId)
    if (pidx === -1 || perms[pidx].deleted) {
      const perm = deepMerge(permissionDefaults(uid ?? null, gid ?? null), args)
      perm.id = permId
      perm.deleted = false
      if (uid !== undefined) perm.uid = uid
      if (gid !== undefined) perm.gid = gid
      if (pidx === -1) perms.push(perm)
      else perms[pidx] = perm
      await this._saveStandalone(perms)
    }
    return permId
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    // an inline row is only returned in the deleted state asked for, so a
    // deleted explicit permission stops authorizing and getEffective falls
    // back to the group
    const inline = (perm) => {
      if (!perm) return undefined
      if (Boolean(perm.deleted) !== Boolean(deletedArg)) return undefined
      return this._postProcess(perm, deletedArg)
    }

    if (args.uid !== undefined) {
      const users = await this._loadUsers()
      return inline(users.find((u) => u.id === args.uid)?.permissions)
    }

    if (args.gid !== undefined) {
      // group-level lookup: no uid qualifier
      const groups = await this._loadGroups()
      return inline(groups.find((g) => g.id === args.gid)?.permissions)
    }

    if (args.id !== undefined) {
      // user rows first, group rows last: explicit ids can collide with
      // generated ones (fixtures give user 4096 and group 4096 the same id),
      // and the user's own row is the one /permission/{id} means
      const users = await this._loadUsers()
      const fromUser = inline(users.find((u) => u.permissions?.id === args.id)?.permissions)
      if (fromUser) return fromUser

      const perms = await this._loadStandalone()
      const fromStandalone = inline(perms.find((p) => p.id === args.id))
      if (fromStandalone) return fromStandalone

      const groups = await this._loadGroups()
      return inline(groups.find((g) => g.permissions?.id === args.id)?.permissions)
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
    if (Boolean(group.permissions.deleted) !== Boolean(deletedArg)) return undefined
    return this._postProcess(group.permissions, deletedArg)
  }

  async put(args) {
    args = expandFlatPermissions(JSON.parse(JSON.stringify(args)))
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

function expandFlatPermissions(permission) {
  for (const field of ['inherit', 'self_write', 'deleted']) {
    if (permission[field] !== undefined)
      permission[field] = permission[field] === true || permission[field] === 1
  }

  if (permission.usable_ns !== undefined) {
    const usable = permission.usable_ns
    let values = []
    if (Array.isArray(usable)) values = usable.map(String)
    else if (![undefined, null, ''].includes(usable)) values = String(usable).split(',')
    permission.nameserver ??= {}
    permission.nameserver.usable = values
    delete permission.usable_ns
  }

  for (const resource of ['group', 'nameserver', 'zone', 'zonerecord', 'user']) {
    for (const action of ['create', 'write', 'delete', 'delegate']) {
      const field = `${resource}_${action}`
      if (permission[field] === undefined) continue
      permission[resource] ??= {}
      permission[resource][action] = Boolean(permission[field])
      delete permission[field]
    }
  }
  return permission
}

function permissionDefaults(uid, gid) {
  return {
    inherit: false,
    self_write: false,
    group: { id: gid, create: false, write: false, delete: false },
    nameserver: { usable: [], create: false, write: false, delete: false },
    zone: { create: false, write: false, delete: false, delegate: false },
    zonerecord: { create: false, write: false, delete: false, delegate: false },
    user: { id: uid, create: false, write: false, delete: false },
  }
}

export default PermissionRepoFile
