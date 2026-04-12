/**
 * Permission domain class – pure contract and cross-cutting logic.
 *
 * Has zero knowledge of how permissions are persisted. All permission
 * repository classes must extend this class and implement the repo contract.
 *
 * Repo contract:
 *   create(args)       → id
 *   get(args)          → object | undefined
 *   getGroup(args)     → object | undefined
 *   put(args)          → boolean
 *   delete(args)       → boolean
 *   destroy(args)      → boolean
 */
class PermissionBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  async create(_args) {
    throw new Error('create() not implemented by this store')
  }

  async get(_args) {
    throw new Error('get() not implemented by this store')
  }

  async getGroup(_args) {
    throw new Error('getGroup() not implemented by this store')
  }

  async put(_args) {
    throw new Error('put() not implemented by this store')
  }

  async delete(_args) {
    throw new Error('delete() not implemented by this store')
  }

  async destroy(_args) {
    throw new Error('destroy() not implemented by this store')
  }

  /**
   * Returns the effective permissions for a user:
   * – If the user has their own permission row with inherit=false, return it.
   * – Otherwise return the group-level permissions.
   */
  async getEffective(uid) {
    const userPerm = await this.get({ uid })
    if (userPerm && userPerm.inherit === false) return userPerm
    return this.getGroup({ uid })
  }

  /**
   * Returns true if the user is allowed to perform `action` on `resource`.
   * resource: 'zone' | 'zonerecord' | 'user' | 'group' | 'nameserver'
   * action:   'create' | 'write' | 'delete' | 'delegate'
   */
  async canDo(uid, resource, action) {
    const perm = await this.getEffective(uid)
    if (!perm) return false
    return perm[resource]?.[action] === true
  }
}

export default PermissionBase
