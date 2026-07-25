import crypto from 'node:crypto'

const PBKDF2_ITERATIONS = (() => {
  const raw = process.env.PBKDF2_ITERATIONS
  if (raw === undefined) return 220000
  const parsed = parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(`PBKDF2_ITERATIONS="${raw}" is not a valid positive integer, using 220000`)
    return 220000
  }
  return parsed
})()
const LEGACY_ITERATIONS = 5000
const SELF_DESCRIBING_RE = /^(\d+)\$([0-9a-f]{64})$/

// a stored iteration count is attacker-influenced if the DB is tampered with
const MAX_STORED_ITERATIONS = 10_000_000

function equalsConstantTime(a, b) {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

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

  async hashAuthPbkdf2(pass, salt, iterations = PBKDF2_ITERATIONS) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(pass, salt, iterations, 32, 'sha512', (err, derivedKey) => {
        if (err) return reject(err)
        resolve(derivedKey.toString('hex'))
      })
    })
  }

  async hashForStorage(pass, salt, iterations = PBKDF2_ITERATIONS) {
    const hex = await this.hashAuthPbkdf2(pass, salt, iterations)
    return `${iterations}$${hex}`
  }

  async validPassword(passTry, passDb, username, salt) {
    const invalid = { valid: false, needsUpgrade: false }

    if (!salt && passTry === passDb) {
      return { valid: true, needsUpgrade: true }
    }

    if (salt) {
      // Self-describing format: "iterations$hexHash" — single hash, no fallback
      const m = SELF_DESCRIBING_RE.exec(passDb)
      if (m) {
        const storedIters = parseInt(m[1], 10)
        const storedHashHex = m[2]
        if (storedIters < 1 || storedIters > MAX_STORED_ITERATIONS) {
          console.warn(`refusing stored PBKDF2 iteration count ${storedIters} for user ${username}`)
          return invalid
        }

        let hashed
        try {
          hashed = await this.hashAuthPbkdf2(passTry, salt, storedIters)
        } catch (err) {
          console.error(`PBKDF2 failed for user ${username}`, err)
          return invalid
        }

        if (this.debug) console.log(`self-describing: ${hashed}`)
        if (equalsConstantTime(hashed, storedHashHex)) {
          return { valid: true, needsUpgrade: storedIters < PBKDF2_ITERATIONS }
        }
        return invalid
      }

      // Raw hex (legacy NicTool 2 format, implicitly 5000 iterations)
      const legacy = await this.hashAuthPbkdf2(passTry, salt, LEGACY_ITERATIONS)
      if (this.debug) console.log(`legacy: ${legacy}`)
      if (/^[0-9a-f]{64}$/.test(passDb) && equalsConstantTime(legacy, passDb)) {
        return { valid: true, needsUpgrade: true }
      }
      return invalid
    }

    // Check for HMAC SHA-1 password
    if (/^[0-9a-f]{40}$/.test(passDb)) {
      const digest = crypto.createHmac('sha1', username.toLowerCase()).update(passTry).digest('hex')
      if (this.debug) console.log(`digest: ${digest}`)
      if (equalsConstantTime(digest, passDb)) {
        return { valid: true, needsUpgrade: true }
      }
    }

    return invalid
  }
}

export default UserBase
