import crypto from 'node:crypto'

// v2 writes 32 hex chars. v3 writes 3$ and 64, self describing like a
// password hash, so v3 can tell its rows from v2's in the shared table.
export const V3_PREFIX = '3$'

// a token older than this, give or take the skew, is refused
export const maxAgeSec = 8 * 60 * 60
export const timeSkewSec = 15

export function newSessionValue() {
  return `${V3_PREFIX}${crypto.randomBytes(32).toString('hex')}`
}

export function isV3Session(value) {
  return typeof value === 'string' && value.startsWith(V3_PREFIX)
}
