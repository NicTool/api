/**
 * Base user repository – the persistence contract
 *
 * Has zero knowledge of how users are persisted. All user repository classes
 * must extend this class and implement the repo contract methods. Password
 * hashing and verification live in ../credentials.js.
 *
 * Repo contract:
 *   authenticate(authTry)  → { user, group } | undefined
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
