import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Nameserver from './nameserver.js'

import testCase from './test/nameserver.json' with { type: 'json' }

before(async () => {
  await Nameserver.destroy({ id: testCase.id })
  await Nameserver.create(testCase)
})

after(async () => {
  await Nameserver.destroy({ id: testCase.id })
  Nameserver.mysql.disconnect()
})

describe('nameserver', function () {
  it('gets nameserver by id', async () => {
    const g = await Nameserver.get({ id: testCase.id })
    assert.deepEqual(g[0], testCase)
  })

  it('gets nameserver by name', async () => {
    const g = await Nameserver.get({ name: testCase.name })
    assert.deepEqual(g[0], testCase)
  })

  it('changes a nameserver', async () => {
    assert.ok(
      await Nameserver.put({ id: testCase.id, name: 'b.ns.example.com.' }),
    )
    const ns = await Nameserver.get({ id: testCase.id })
    assert.deepEqual(ns[0].name, 'b.ns.example.com.')
    assert.ok(await Nameserver.put({ id: testCase.id, name: testCase.name }))
  })

  it('deletes a nameserver', async () => {
    assert.ok(await Nameserver.delete({ id: testCase.id }))
    let g = await Nameserver.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await Nameserver.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await Nameserver.get({ id: testCase.id })
    assert.equal(g[0].deleted, false)
  })
})
