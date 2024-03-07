import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Zone from './zone.js'

import testCase from './test/zone.json' with { type: 'json' }

before(async () => {
  await Zone.destroy({ id: testCase.id })
  await Zone.create(testCase)
})

after(async () => {
  // await Zone.destroy({ id: testCase.id })
  Zone.mysql.disconnect()
})

describe('zone', function () {
  it('gets zone by id', async () => {
    const g = await Zone.get({ id: testCase.id })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('gets zone by name', async () => {
    const g = await Zone.get({ zone: testCase.zone })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('changes a zone', async () => {
    assert.ok(
      await Zone.put({ id: testCase.id, mailaddr: 'toastmaster.example.com.' }),
    )
    const ns = await Zone.get({ id: testCase.id })
    assert.deepEqual(ns[0].mailaddr, 'toastmaster.example.com.')
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: testCase.mailaddr }))
  })

  it('deletes a zone', async () => {
    assert.ok(await Zone.delete({ id: testCase.id }))
    let g = await Zone.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await Zone.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await Zone.get({ id: testCase.id })
    assert.equal(g[0].deleted, false)
  })
})
