import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { setEnv, mapToDbColumn, meta, sortKeys, toJson } from './util.js'

describe('util', function () {
  if (process.env.NODE_ENV === undefined) {
    describe('setEnv', function () {
      it('sets process.env.NODE_ENV', async () => {
        setEnv()
        assert.ok(process.env.NODE_ENV)
      })
    })
  }

  describe('meta', () => {
    it('returns the package version', () => {
      assert.ok(/3.0/.test(meta.api.version))
    })
  })

  describe('sortKeys', () => {
    it('orders keys at every depth', () => {
      const sorted = sortKeys({ b: 1, a: { d: 2, c: 3 } })

      assert.deepEqual(Object.keys(sorted), ['a', 'b'])
      assert.deepEqual(Object.keys(sorted.a), ['c', 'd'])
    })

    it('keeps array order while sorting the objects inside', () => {
      const sorted = sortKeys([{ z: 1, a: 2 }, { y: 3 }])

      assert.deepEqual(Object.keys(sorted[0]), ['a', 'z'])
      assert.equal(sorted[1].y, 3)
    })

    it('passes scalars and null through', () => {
      assert.equal(sortKeys(null), null)
      assert.equal(sortKeys(5), 5)
      assert.equal(sortKeys('x'), 'x')
    })

    it('leaves non-plain objects intact', () => {
      const d = new Date('2020-01-01T00:00:00Z')
      assert.equal(sortKeys(d), d)
    })
  })

  describe('toJson', () => {
    it('sorts, indents by one space, and ends with a newline', () => {
      assert.equal(toJson({ b: 1, a: 2 }), '{\n "a": 2,\n "b": 1\n}\n')
    })

    it('round-trips through JSON.parse', () => {
      const value = { zone: [{ id: 1, last_publish: null }] }
      assert.deepEqual(JSON.parse(toJson(value)), value)
    })
  })

  describe('mapToDbColumn', function () {
    it('maps short names to DB fields', async () => {
      const before = { id: 5 }
      const mappings = { id: 'nt_user_id' }
      assert.deepEqual(mapToDbColumn(before, mappings), { nt_user_id: 5 })
    })
  })
})
