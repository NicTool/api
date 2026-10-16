import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Zone from '../index.js'
import Nameserver from '../../nameserver/index.js'

import testCase from './zone.json' with { type: 'json' }
import nsCase from '../../nameserver/test/nameserver.json' with { type: 'json' }

const nsA = { ...nsCase, id: 4082, name: 'a.zone-test.example.com.', ttl: 7200 }
const nsB = { ...nsCase, id: 4081, name: 'b.zone-test.example.com.' }
const nsGone = { ...nsCase, id: 4083, name: 'gone.zone-test.example.com.' }

before(async () => {
  await Zone.destroy({ id: testCase.id })
  await Zone.create(testCase)
  for (const ns of [nsA, nsB, nsGone]) {
    await Nameserver.destroy({ id: ns.id })
    await Nameserver.create(ns)
  }
  await Nameserver.delete({ id: nsGone.id })
})

after(async () => {
  // await Zone.destroy({ id: testCase.id })
  for (const ns of [nsA, nsB, nsGone]) await Nameserver.destroy({ id: ns.id })
  await Zone.disconnect()
})

describe('zone', function () {
  it('gets zone by id', async () => {
    const g = await Zone.get({ id: testCase.id })
    delete g[0].last_modified
    assert.deepEqual(g[0], { ...testCase, nameservers: [] })
  })

  describe('nameservers', () => {
    after(async () => {
      await Zone.put({ id: testCase.id, nameservers: [] })
    })

    it('stores assignments in ascending id order', async () => {
      assert.ok(await Zone.put({ id: testCase.id, nameservers: [nsA.id, nsB.id, nsA.id] }))
      const [z] = await Zone.get({ id: testCase.id })
      assert.deepEqual(z.nameservers, [nsB.id, nsA.id])
    })

    it('leaves assignments alone when a put omits them', async () => {
      assert.ok(await Zone.put({ id: testCase.id, description: 'kept ns' }))
      const [z] = await Zone.get({ id: testCase.id })
      assert.deepEqual(z.nameservers, [nsB.id, nsA.id])
      await Zone.put({ id: testCase.id, description: testCase.description })
    })

    it('lists the active assigned nameservers, lowest id first', async () => {
      await Zone.put({ id: testCase.id, nameservers: [nsA.id, nsB.id, nsGone.id] })
      const zoneName = testCase.zone
      assert.deepEqual(await Zone.nameserversFor(testCase.id), [
        { zone: zoneName, name: nsB.name, ttl: nsB.ttl },
        { zone: zoneName, name: nsA.name, ttl: nsA.ttl },
      ])
    })

    it('clears assignments', async () => {
      assert.ok(await Zone.put({ id: testCase.id, nameservers: [] }))
      const [z] = await Zone.get({ id: testCase.id })
      assert.deepEqual(z.nameservers, [])
      assert.deepEqual(await Zone.nameserversFor(testCase.id), [])
    })

    it('drops assignments with the zone', async () => {
      const doomed = { ...testCase, id: 4089, zone: 'doomed.example.com', nameservers: [nsA.id] }
      await Zone.destroy({ id: doomed.id })
      await Zone.create(doomed)
      assert.deepEqual((await Zone.get({ id: doomed.id }))[0].nameservers, [nsA.id])

      await Zone.destroy({ id: doomed.id })
      await Zone.create({ ...doomed, nameservers: undefined })
      assert.deepEqual((await Zone.get({ id: doomed.id }))[0].nameservers, [])
      await Zone.destroy({ id: doomed.id })
    })

    it('assigns nothing to a zone that does not exist', async () => {
      const missing = { ...testCase, id: 4089, zone: 'missing.example.com' }
      await Zone.destroy({ id: missing.id })
      assert.equal(await Zone.put({ id: missing.id, nameservers: [nsA.id] }), false)

      await Zone.create(missing)
      assert.deepEqual((await Zone.get({ id: missing.id }))[0].nameservers, [])
      await Zone.destroy({ id: missing.id })
    })

    it('leaves one of two concurrent replacements, not both', async () => {
      await Promise.all([
        Zone.put({ id: testCase.id, nameservers: [nsA.id] }),
        Zone.put({ id: testCase.id, nameservers: [nsB.id] }),
      ])
      const [z] = await Zone.get({ id: testCase.id })
      assert.ok(
        [[nsA.id], [nsB.id]].some((set) => set.join() === z.nameservers.join()),
        z.nameservers.join(),
      )
      await Zone.put({ id: testCase.id, nameservers: [] })
    })
  })

  it('gets zone by name', async () => {
    const g = await Zone.get({ zone: testCase.zone })
    delete g[0].last_modified
    assert.deepEqual(g[0], { ...testCase, nameservers: [] })
  })

  it('changes a zone', async () => {
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: 'toastmaster.example.com.' }))
    const ns = await Zone.get({ id: testCase.id })
    assert.deepEqual(ns[0].mailaddr, 'toastmaster.example.com.')
    assert.ok(await Zone.put({ id: testCase.id, mailaddr: testCase.mailaddr }))
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
