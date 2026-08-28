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

  describe('nameservers', () => {
    it('starts with no assignment', async () => {
      assert.deepEqual(await Zone.nameserverIds(testCase.id), [])
    })

    it('assigns nameservers alongside other fields', async () => {
      assert.ok(await Zone.put({ id: testCase.id, description: 'ns', nameservers: [4096, 4095, 4096] }))
      assert.deepEqual(await Zone.nameserverIds(testCase.id), [4095, 4096])
      const z = await Zone.get({ id: testCase.id })
      assert.equal(z[0].description, 'ns')
      assert.equal(z[0].nameservers, undefined)
    })

    it('replaces the assignment on its own', async () => {
      assert.ok(await Zone.put({ id: testCase.id, nameservers: [4096] }))
      assert.deepEqual(await Zone.nameserverIds(testCase.id), [4096])
    })

    it('leaves the assignment alone when absent', async () => {
      await Zone.put({ id: testCase.id, description: testCase.description })
      assert.deepEqual(await Zone.nameserverIds(testCase.id), [4096])
    })

    it('clears the assignment with an empty list', async () => {
      assert.ok(await Zone.put({ id: testCase.id, nameservers: [] }))
      assert.deepEqual(await Zone.nameserverIds(testCase.id), [])
    })

    it('stores the assignment on create and drops it on destroy', async () => {
      const id = testCase.id + 1
      await Zone.destroy({ id })
      await Zone.create({ ...testCase, id, zone: 'ns.example.com', nameservers: [4095] })
      assert.deepEqual(await Zone.nameserverIds(id), [4095])
      assert.ok(await Zone.destroy({ id }))
      assert.deepEqual(await Zone.nameserverIds(id), [])
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
  })
})
