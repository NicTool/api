import crypto from 'node:crypto'

/**
 * User domain class – pure attributes and password business logic.
 *
 * Has zero knowledge of how users are persisted. All user repository classes
 * must extend this class and implement the repo contract methods.
 *
 * Repo contract:
 *   authenticate(authTry)  → { user, group } | undefined
 *   get(args)              → object[]
 *   create(args)           → number  (userId)
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

  // -------------------------------------------------------------------------
  // Password business logic
  // -------------------------------------------------------------------------

  generateSalt(length = 16) {
    const chars = Array.from({ length: 87 }, (_, i) => String.fromCharCode(i + 40)) // ASCII 40–126
    let salt = ''
    for (let i = 0; i < length; i++) {
      salt += chars[Math.floor(Math.random() * 87)]
    }
    return salt
  }

  async hashAuthPbkdf2(pass, salt) {
    return new Promise((resolve, reject) => {
      // match the defaults for NicTool 2.x
      crypto.pbkdf2(pass, salt, 5000, 32, 'sha512', (err, derivedKey) => {
        if (err) return reject(err)
        resolve(derivedKey.toString('hex'))
      })
    })
  }

  async validPassword(passTry, passDb, username, salt) {
    if (!salt && passTry === passDb) return true // plain pass, TODO, encrypt!

    if (salt) {
      const hashed = await this.hashAuthPbkdf2(passTry, salt)
      if (this.debug) console.log(`hashed: (${hashed === passDb}) ${hashed}`)
      return hashed === passDb
    }

    // Check for HMAC SHA-1 password
    if (/^[0-9a-f]{40}$/.test(passDb)) {
      const digest = crypto.createHmac('sha1', username.toLowerCase()).update(passTry).digest('hex')
      if (this.debug) console.log(`digest: (${digest === passDb}) ${digest}`)
      return digest === passDb
    }

    return false
  }
}

export default UserBase
