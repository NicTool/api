import { StoreConflictError } from '../../store/error.js'

/**
 * Group domain class – pure attributes and business logic.
 *
 * Has zero knowledge of how groups are persisted. All group repository classes
 * must extend this class and implement the repo contract methods.
 *
 * Repo contract:
 *   get(args)              → object[]
 *   create(args, options)  → number  (groupId)
 *   put(args)              → boolean
 *   delete(args)           → boolean
 *   destroy(args)          → boolean
 *   subgroupGids(rootGid)  → number[]  (rootGid plus every descendant)
 */
class GroupBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  disconnect() {
    // noop, for repos that need to clean up resources
  }

  // -------------------------------------------------------------------------
  // Repo contract – subclasses must implement these
  // -------------------------------------------------------------------------

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

  async subgroupGids(_rootGid) {
    throw new Error('subgroupGids() not implemented by this repo')
  }
}

export default GroupBase

export function siblingNameConflict(name, parentGid) {
  return new StoreConflictError('group', undefined, `group ${name} already exists in group ${parentGid}`)
}

export function siblingNameTaken(groups, id, parentGid, name) {
  const taken = groups.some(
    (g) => g.id !== id && !g.deleted && (g.parent_gid ?? 0) === parentGid && g.name === name,
  )
  if (taken) throw siblingNameConflict(name, parentGid)
}
