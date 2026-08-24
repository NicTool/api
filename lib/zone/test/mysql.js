import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Zone from '../index.js'

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
