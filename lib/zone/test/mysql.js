import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Zone from '../index.js'
import { zoneLockName } from '../store/mysql.js'

import baseCase from './zone.json' with { type: 'json' }

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

  it('assigns nameservers to an auto-increment id', async () => {
    const id = await Zone.create({
      ...testCase, id: 0, zone: 'auto-ns.example.com', nameservers: [4095],
    })
    assert.ok(id > 0)
    assert.deepEqual(await Zone.nameserverIds(id), [4095])
    assert.ok(await Zone.destroy({ id }))
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
