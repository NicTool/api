import FileStore, { serialize } from '../../store/file.js'
import { idConflict, StoreInvalidError } from '../../store/error.js'

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
 *      store. Looked up by gid only, as their ids collide with users'.
 *
 *   3. Standalone permission file — fallback for permission IDs that reference
 *      users/groups not present in the user / group files.
 *
 * get({ uid })      → inline permissions of that user
 * get({ gid })      → inline permissions of that group (uid absent)
 * get({ id })       → search user → standalone by permissions.id
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

  async _loadGroups() {
    return this.groupFile.load('group')
  }

  async _loadStandalone() {
    return this.standaloneFile.load('permission')
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

  // one at a time, so an id checked as free is still free when it's written
  async create(args, options) {
    return serialize('permission create', () => this._create(args, options))
  }

  async _create(args, options) {
    args = JSON.parse(JSON.stringify(args))
    const uid = args.uid ?? args.user?.id ?? undefined
    const gid = args.gid ?? args.group?.id ?? undefined
    delete args.uid
    delete args.gid
    if (uid === undefined && gid === undefined)
      throw new StoreInvalidError('a permission needs a user or group')

    if (args.id !== undefined) {
      const [users, groups, permissions] = await Promise.all([
        this._loadUsers(),
        this._loadGroups(),
        this._loadStandalone(),
      ])
      const existing = [
        ...users.map((user) => ({ permission: user.permissions, uid: user.id, gid: user.gid })),
        ...groups.map((group) => ({ permission: group.permissions, gid: group.id })),
        ...permissions.map((permission) => ({
          permission,
          uid: permission.uid ?? permission.user?.id ?? undefined,
          gid: permission.gid ?? permission.group?.id ?? undefined,
        })),
      ].find((entry) => entry.permission?.id === args.id)
      if (existing) {
        const sameTarget =
          uid !== undefined
            ? existing.uid === uid
            : gid !== undefined
              ? existing.uid === undefined && existing.gid === gid
              : true
        return idConflict('permission', args.id, sameTarget ? options : undefined)
      }
    }

    if (uid !== undefined) {
      const created = await this.userFile.mutate('user', (users, data, keep) => {
        const user = users.find((u) => u.id === uid)
        if (!user) return false
        if (user.permissions) return keep(idConflict('permission', user.permissions.id, options))
        const perm = JSON.parse(JSON.stringify(args))
        perm.id = args.id ?? uid
        if (!perm.user) perm.user = {}
        perm.user.id = uid
        if (!perm.group) perm.group = {}
        perm.group.id = gid ?? user.gid
        user.permissions = perm
        return perm.id
      })
      if (created !== false) return created
    }

    if (gid !== undefined && uid === undefined) {
      const created = await this.groupFile.mutate('group', (groups, data, keep) => {
        const group = groups.find((g) => g.id === gid)
        if (!group) return false
        if (group.permissions) return keep(idConflict('permission', group.permissions.id, options))
        const perm = JSON.parse(JSON.stringify(args))
        perm.id = args.id ?? gid
        if (!perm.group) perm.group = {}
        perm.group.id = gid
        group.permissions = perm
        return perm.id
      })
      if (created !== false) return created
    }

    // Standalone fallback: neither user nor group record found
    const permId = args.id ?? uid ?? gid

    return this.standaloneFile.mutate('permission', (perms, data, keep) => {
      if (perms.some((permission) => permission.id === permId)) {
        return keep(idConflict('permission', permId, options))
      }
      const perm = { ...args, id: permId }
      if (uid !== undefined) perm.uid = uid
      if (gid !== undefined) perm.gid = gid
      perms.push(perm)
      return permId
    })
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
      // not groups: user and group permissions share ids, so a group's would
      // answer for a destroyed user's. Group permissions are reached by gid.
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

  // finds the permission where get({ id }) does, under that file's lock
  async _change(id, change) {
    const changed = await this.userFile.mutate('user', (users) => {
      const user = users.find((u) => u.permissions?.id === id)
      if (!user) return false
      change(user, 'permissions')
      return true
    })
    if (changed) return true
    return this.standaloneFile.mutate('permission', (perms) => {
      const idx = perms.findIndex((p) => p.id === id)
      if (idx === -1) return false
      change(perms, idx)
      return true
    })
  }

  async put(args) {
    args = JSON.parse(JSON.stringify(args))
    if (!args.id) return false
    const id = args.id
    delete args.id
    return this._change(id, (holder, key) => {
      holder[key] = deepMerge(holder[key], args)
    })
  }

  async delete(args) {
    if (!args.id) return false
    const deletedVal = args.deleted ?? true
    return this._change(args.id, (holder, key) => {
      holder[key].deleted = deletedVal
    })
  }

  disconnect() {
    // noop
  }

  async destroy(args) {
    if (!args.id) return false
    return this._change(args.id, (holder, key) => {
      if (Array.isArray(holder)) holder.splice(key, 1)
      else delete holder[key]
    })
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

export default PermissionRepoFile
