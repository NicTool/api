import crypto from 'node:crypto'

const DEFAULT_ITERATIONS = 220000
const LEGACY_ITERATIONS = 5000
const SELF_DESCRIBING_RE = /^(\d+)\$([0-9a-f]{64})$/
const LEGACY_PBKDF2_RE = /^[0-9a-f]{64}$/
const LEGACY_SHA1_RE = /^[0-9a-f]{40}$/

// PBKDF2-SHA512 costs ~40ms at the 220k default. This ceiling bounds both a
// misconfigured env var and a tampered DB row: a stored count is untrusted
// input to a CPU bound function, so cap the amplification at roughly 4x.
const MAX_ITERATIONS = 1_000_000

function validIterations(n) {
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_ITERATIONS
}

const PBKDF2_ITERATIONS = (() => {
  const raw = process.env.PBKDF2_ITERATIONS
  if (raw === undefined) return DEFAULT_ITERATIONS

  // Number() rather than parseInt(), which would read "220000zzz" as 220000
  const parsed = Number(raw)
  if (!validIterations(parsed)) {
    console.warn(
      `PBKDF2_ITERATIONS="${raw}" is not an integer in 1..${MAX_ITERATIONS}, using ${DEFAULT_ITERATIONS}`,
    )
    return DEFAULT_ITERATIONS
  }
  return parsed
})()

function equalsConstantTime(a, b) {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Password hashing and verification, independent of how users are stored.
 *
 * Hashes are stored self-describing as `iterations$hexHash`, so verification
 * never has to guess a format and a wrong password costs exactly one PBKDF2
 * computation no matter how many legacy formats have existed.
 */
class Credentials {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
  }

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

  /**
   * The password/pass_salt pair to persist for a plain text password.
   *
   * Omit `salt` to get a fresh one, which is what a password change and a
   * hash upgrade both want. Pass an existing salt only to preserve a caller
   * supplied one, as create() does for fixtures and imports.
   */
  async forStorage(pass, salt = this.generateSalt()) {
    return { password: await this.hashForStorage(pass, salt), pass_salt: salt }
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
        if (!validIterations(storedIters)) {
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

      // Raw hex (legacy NicTool 2 format, implicitly 5000 iterations). Reject
      // on shape before hashing, so an unrecognized stored value still costs
      // an attempt exactly zero PBKDF2 computations.
      if (!LEGACY_PBKDF2_RE.test(passDb)) return invalid

      const legacy = await this.hashAuthPbkdf2(passTry, salt, LEGACY_ITERATIONS)
      if (this.debug) console.log(`legacy: ${legacy}`)
      if (equalsConstantTime(legacy, passDb)) {
        return { valid: true, needsUpgrade: true }
      }
      return invalid
    }

    // HMAC SHA-1 (NicTool 2). Verified, never written: a successful match
    // returns needsUpgrade so the caller rewrites it as PBKDF2 immediately.
    // CodeQL js/insufficient-password-hash flags this; dismissed as won't fix.
    if (LEGACY_SHA1_RE.test(passDb)) {
      const digest = crypto.createHmac('sha1', username.toLowerCase()).update(passTry).digest('hex')
      if (this.debug) console.log(`digest: ${digest}`)
      if (equalsConstantTime(digest, passDb)) {
        return { valid: true, needsUpgrade: true }
      }
    }

    return invalid
  }
}

export default new Credentials()
export { Credentials }
