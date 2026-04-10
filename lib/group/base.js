/**
 * Group domain class – pure attributes and business logic.
 *
 * Has zero knowledge of how groups are persisted. All group repository classes
 * must extend this class and implement the repo contract methods.
 *
 * Repo contract:
 *   get(args)              → object[]
 *   create(args)           → number  (groupId)
 *   put(args)              → boolean
 *   delete(args)           → boolean
 *   destroy(args)          → boolean
 */
class GroupBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  // -------------------------------------------------------------------------
  // Repo contract – subclasses must implement these
  // -------------------------------------------------------------------------

  async get(_args) {
    throw new Error('get() not implemented by this repo')
  }

  async create(_args) {
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

export default GroupBase
