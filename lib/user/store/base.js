import { StoreConflictError, StoreInvalidError } from '../../store/error.js'

/**
 * Base user repository – the persistence contract
 *
 * Has zero knowledge of how users are persisted. All user repository classes
 * must extend this class and implement the repo contract methods. Password
 * hashing and verification live in ../credentials.js.
 *
 * Repo contract:
 *   authenticate(authTry)  → { user, group } | undefined
 *   isAdmin(id)            → boolean
 *   checkPassword(args)    → boolean | undefined  (undefined: no such user)
 *   get(args)              → object[]
 *   create(args, options)  → number  (userId)
 *   put(args)              → boolean
 *   delete(args)           → boolean
 *   destroy(args)          → boolean
 */
class UserBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  disconnect() {
    // noop, for repos that need to clean up resources
  }

  // -------------------------------------------------------------------------
  // Repo contract – subclasses must implement these
  // -------------------------------------------------------------------------

  async authenticate(_authTry) {
    throw new Error('authenticate() not implemented by this repo')
  }

  async isAdmin(_id) {
    throw new Error('isAdmin() not implemented by this repo')
  }

  async checkPassword(_args) {
    throw new Error('checkPassword() not implemented by this repo')
  }

  async get(_args) {
    throw new Error('get() not implemented by this repo')
  }

  async create(_args, _options) {
    throw new Error('create() not implemented by this repo')
  }

  async put(_args) {
    throw new Error('put() not implemented by this repo')
  }

  async delete(_args) {
    throw new Error('delete() not implemented by this repo')
  }

  async destroy(_args) {
    throw new Error('destroy() not implemented by this repo')
  }
}

export default UserBase

// login is username@groupname, so a username can't repeat across live groups of one name
export function usernameConflict(username, groupName) {
  return new StoreConflictError('user', undefined, `username ${username}@${groupName} is not unique`)
}

export function missingGroup(gid) {
  return new StoreInvalidError(gid === undefined ? 'a user needs a gid' : `group ${gid} doesn't exist`)
}

export function requireGroup(groups, gid) {
  const group = groups.find((g) => g.id === gid)
  if (!group) throw missingGroup(gid)
  return group
}

// a deleted group's users only meet the other groups when it is restored
export function usernameTaken(users, groups, user) {
  const group = requireGroup(groups, user.gid)
  const named = new Set(
    group.deleted ? [group.id] : groups.filter((g) => g.name === group.name && !g.deleted).map((g) => g.id),
  )
  const taken = users.some(
    (u) => u.id !== user.id && !u.deleted && u.username === user.username && named.has(u.gid),
  )
  if (taken) throw usernameConflict(user.username, group.name)
}

export function groupNameTaken(users, groups, gid, name) {
  const named = new Set(
    groups.filter((g) => g.id === gid || (g.name === name && !g.deleted)).map((g) => g.id),
  )
  const count = new Map()
  for (const u of users) {
    if (!u.deleted && named.has(u.gid)) count.set(u.username, (count.get(u.username) ?? 0) + 1)
  }
  const clash = users.find((u) => u.gid === gid && !u.deleted && count.get(u.username) > 1)
  if (clash) throw usernameConflict(clash.username, name)
}
