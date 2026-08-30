import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import Config from './config.js'
import { pageLimit } from './page.js'

describe('pageLimit', () => {
  const savedEnv = process.env.NICTOOL_HTTP_LIST_LIMIT_MAX

  after(() => {
    if (savedEnv === undefined) delete process.env.NICTOOL_HTTP_LIST_LIMIT_MAX
    else process.env.NICTOOL_HTTP_LIST_LIMIT_MAX = savedEnv
    Config.cfg = {}
  })

  it('applies the default and clamps both ends', async () => {
    assert.equal(await pageLimit(undefined), 1000)
    assert.equal(await pageLimit(undefined, 50), 50)
    assert.equal(await pageLimit(50), 50)
    assert.equal(await pageLimit(5000), 1000)
    assert.equal(await pageLimit(0), 1)
    assert.equal(await pageLimit(-10), 1)
  })

  it('honors the operator ceiling', async () => {
    process.env.NICTOOL_HTTP_LIST_LIMIT_MAX = '25'
    Config.cfg = {}
    assert.equal(await pageLimit(50), 25)
    assert.equal(await pageLimit(10), 10)
  })
})
