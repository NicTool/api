import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { setEnv, mapToDbColumn, meta } from './util.js'

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
      assert.ok(/3.0.0/.test(meta.api.version))
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
