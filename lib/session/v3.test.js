import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isV3Session, newSessionValue } from './v3.js'

describe('session value', () => {
  it('is new and self describing on every login', () => {
    const a = newSessionValue()
    assert.match(a, /^3\$[0-9a-f]{64}$/)
    assert.notEqual(a, newSessionValue())
    assert.ok(isV3Session(a))
  })

  it('does not claim a v2 session', () => {
    assert.ok(!isV3Session('0123456789abcdef0123456789abcdef'))
  })
})
