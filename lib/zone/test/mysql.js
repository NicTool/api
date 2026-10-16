import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Zone from '../index.js'
import { zoneLockName } from '../store/mysql.js'

import baseCase from './zone.json' with { type: 'json' }

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

  for (const [writer, stored] of [
    ['v2, in capitals', testCase.zone.toUpperCase()],
    ['an older v3, with the trailing dot', `${testCase.zone}.`],
  ]) {
    it(`matches a name stored by ${writer}`, async () => {
      await Zone.mysql.execute('UPDATE nt_zone SET zone = ? WHERE nt_zone_id = ?', [stored, testCase.id])
      try {
        assert.equal((await Zone.get({ zone: testCase.zone }))[0]?.id, testCase.id)
        assert.equal(await Zone.count({ zone: testCase.zone }), 1)
        await assert.rejects(Zone.create({ ...testCase, id: undefined }), /already exists/)
      } finally {
        await Zone.mysql.execute('UPDATE nt_zone SET zone = ? WHERE nt_zone_id = ?', [
          testCase.zone,
          testCase.id,
        ])
      }
    })
  }

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
