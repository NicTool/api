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
  await Zone.disconnect()
})

describe('zone', function () {
  it('gets zone by id', async () => {
    const g = await Zone.get({ id: testCase.id })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('lists the nameservers of a zone', async () => {
    assert.ok(Array.isArray(await Zone.nameserversFor(testCase.id)))
  })

  it('gets zone by name', async () => {
    const g = await Zone.get({ zone: testCase.zone })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('finds a zone by its name in any case, with or without the dot', async () => {
    const g = await Zone.get({ zone: `${testCase.zone.toUpperCase()}.` })
    assert.equal(g[0]?.zone, testCase.zone)
  })

  it('changes a zone', async () => {
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: 'toastmaster.example.com.' }))
    const ns = await Zone.get({ id: testCase.id })
    assert.deepEqual(ns[0].mailaddr, 'toastmaster.example.com.')
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: testCase.mailaddr }))
  })

  describe('zone names', () => {
    const other = { ...testCase, id: testCase.id + 1, zone: 'other-name.example.com' }
    const dup = { ...testCase, id: testCase.id + 2, zone: `${testCase.zone.toUpperCase()}.` }

    before(async () => {
      await Zone.destroy({ id: other.id })
      await Zone.destroy({ id: dup.id })
      await Zone.create(other)
    })

    after(async () => {
      await Zone.destroy({ id: other.id })
      await Zone.destroy({ id: dup.id })
    })

    it('rejects a second live zone with the same name', async () => {
      await assert.rejects(Zone.create(dup), /already exists/)
      assert.equal((await Zone.get({ id: dup.id })).length, 0)
    })

    it('rejects a rename onto a live name', async () => {
      await assert.rejects(Zone.put({ id: other.id, zone: testCase.zone }), /already exists/)
      assert.equal((await Zone.get({ id: other.id }))[0].zone, other.zone)
    })

    it('rejects restoring a zone beside a live one with its name', async () => {
      await Zone.delete({ id: other.id })
      await Zone.put({ id: other.id, zone: testCase.zone })
      await assert.rejects(Zone.put({ id: other.id, deleted: false }), /already exists/)
      await assert.rejects(Zone.delete({ id: other.id, deleted: 0 }), /already exists/)
      assert.equal((await Zone.get({ id: other.id, deleted: true }))[0].deleted, true)
      assert.ok(await Zone.put({ id: other.id, description: 'edited', deleted: undefined }))
      assert.equal((await Zone.get({ id: other.id, deleted: true }))[0].deleted, true)
    })
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
    it('deletes when deleted is null', async () => {
      await Zone.delete({ id: testCase.id, deleted: null })
      assert.equal((await Zone.get({ id: testCase.id })).length, 0)
      await Zone.delete({ id: testCase.id, deleted: 0 })
    })
  })
})
