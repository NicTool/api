/**
 * Zone domain class – pure contract, no persistence knowledge.
 *
 * All zone repository classes must extend this class and implement:
 *   get(args)     → object[]
 *   count(args)   → number
 *   create(args)  → number  (zoneId)
 *   put(args)     → boolean
 *   delete(args)  → boolean
 *   destroy(args) → boolean
 */
class ZoneBase {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

  async get(_args) {
    throw new Error('get() not implemented by this repo')
  }

  async count(_args) {
    throw new Error('count() not implemented by this repo')
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

export default ZoneBase
