import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Zone from '../index.js'

import testCase from './zone.json' with { type: 'json' }

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
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: 'toastmaster.example.com.' }))
    const ns = await Zone.get({ id: testCase.id })
    assert.deepEqual(ns[0].mailaddr, 'toastmaster.example.com.')
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: testCase.mailaddr }))
  })

  it('handles null minimum gracefully', async () => {
    await Zone.mysql.execute('UPDATE nt_zone SET minimum = NULL WHERE nt_zone_id = ?', [testCase.id])

    const z = await Zone.get({ id: testCase.id })
    assert.equal(z[0].minimum, 3600)

    await Zone.mysql.execute('UPDATE nt_zone SET minimum = ? WHERE nt_zone_id = ?', [
      testCase.minimum,
      testCase.id,
    ])
  })

  describe('deletes a zone', async () => {
    it('can delete a zone', async () => {
      assert.ok(await Zone.delete({ id: testCase.id }))
    })
    it('default get does not find deleted zone', async () => {
      let z = await Zone.get({ id: testCase.id })
      assert.equal(z.length, 0)
    })
    it('can get the deleted zone', async () => {
      let z = await Zone.get({ id: testCase.id, deleted: 1 })
      assert.equal(z[0]?.deleted, true)
    })
    it('can restore the zone', async () => {
      await Zone.delete({ id: testCase.id, deleted: 0 })
      let z = await Zone.get({ id: testCase.id })
      assert.equal(z.length, 1)
    })
  })
})
