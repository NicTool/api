import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Zone from '../index.js'
import Nameserver from '../../nameserver/index.js'
import { zoneLockName } from '../store/mysql.js'

import baseCase from './zone.json' with { type: 'json' }
import nsCase from '../../nameserver/test/nameserver.json' with { type: 'json' }

// A distinct id and name, as index.js holds the fixture's.
const testCase = {
  ...baseCase,
  id: 9001,
  zone: 'mysql-zone.example.com',
  mailaddr: 'hostmaster.mysql-zone.example.com.',
}

before(async () => {
  await Zone.destroy({ id: testCase.id })
  await Zone.create(testCase)
})

after(async () => {
  await Zone.destroy({ id: testCase.id })
  await Zone.disconnect()
})

describe('zone (mysql)', function () {
  it('uses a canonical advisory lock name within the DB limit', () => {
    const lockName = zoneLockName('Example.COM.')
    assert.equal(Buffer.byteLength(lockName), 64)
    assert.equal(lockName, zoneLockName('example.com'))
    assert.notEqual(lockName, zoneLockName('other.example.com'))
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
})

describe('mysql zone and nameserver delete races', () => {
  const ns = { ...nsCase, id: 9002, name: 'race.mysql-zone.example.com.' }
  const zids = [9011, 9012, 9013, 9014, 9015]

  before(async () => {
    await Nameserver.destroy({ id: ns.id })
    await Nameserver.create(ns)
  })

  after(async () => {
    for (const id of zids) await Zone.destroy({ id })
    await Nameserver.destroy({ id: ns.id })
  })

  it('lets a zone take a nameserver or the nameserver go, not both', async () => {
    for (const id of zids) {
      await Nameserver.delete({ id: ns.id, deleted: 0 })
      const results = await Promise.allSettled([
        Zone.create({ ...testCase, id, zone: `race${id}.mysql-zone.example.com`, nameservers: [ns.id] }),
        Nameserver.delete({ id: ns.id }),
      ])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      const [created, deleted] = results
      if (created.status === 'rejected') assert.equal(created.reason.code, 'STORE_INVALID')
      if (deleted.status === 'rejected') assert.equal(deleted.reason.code, 'STORE_CONFLICT')
      const zoneLives = (await Zone.get({ id })).length === 1
      const nsLives = (await Nameserver.get({ id: ns.id })).length === 1
      assert.equal(zoneLives, nsLives)
      await Zone.destroy({ id })
    }
  })
})
