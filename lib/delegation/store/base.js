/**
 * Delegation domain class – pure contract and cross-cutting logic.
 *
 * Has zero knowledge of how delegations are persisted. All delegation
 * repository classes must extend this class and implement the repo contract.
 *
 * Repo contract:
 *   create(args)            → { created: true } | { duplicate: true }
 *   getDelegated(gid, type) → object[]  (delegations a group holds)
 *   getDelegates(oid, type, gid?) → object[]  (groups holding a delegation)
 *   put(args)               → true | null  (null when nothing to update)
 *   delete(args)            → true | null
 *   writeLog(data, action)  → void
 */
export const PERM_FIELDS = [
  'perm_write',
  'perm_delete',
  'perm_delegate',
  'zone_perm_add_records',
  'zone_perm_delete_records',
]

class DelegationBase {
  async create(_args) {
    throw new Error('create() not implemented by this store')
  }

  async getDelegated(_gid, _type) {
    throw new Error('getDelegated() not implemented by this store')
  }

  async getDelegates(_oid, _type, _gid) {
    throw new Error('getDelegates() not implemented by this store')
  }

  async put(_args) {
    throw new Error('put() not implemented by this store')
  }

  async delete(_args) {
    throw new Error('delete() not implemented by this store')
  }

  async writeLog(_data, _action) {
    throw new Error('writeLog() not implemented by this store')
  }

  /** Route a public get({gid, oid, type}) call to the right repo method. */
  async get(args) {
    const { gid, oid } = args
    const type = args.type ?? 'ZONE'
    if (oid !== undefined) return this.getDelegates(oid, type, gid)
    if (gid !== undefined) return this.getDelegated(gid, type)
    return []
  }
}

export default DelegationBase
