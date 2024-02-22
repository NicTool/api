const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const util = require('../lib/util')

describe('util', function () {
  if (process.env.NODE_ENV === undefined) {
    describe('setEnv', function () {
      it('sets process.env.NODE_ENV', async () => {
        util.setEnv()
        assert.ok(process.env.NODE_ENV)
      })
    })
  }

  describe('meta', () => {
    it('returns the package version', () => {
      assert.deepEqual(util.meta, { api: { version: '3.0.0' } })
    })
  })
})
