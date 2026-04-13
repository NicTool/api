import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Nameserver from '../index.js'

import baseCase from './nameserver.json' with { type: 'json' }

// Use a distinct id so this test never races with index.js (same fixture id = concurrent NULL mutation)
const testCase = { ...baseCase, id: 9001 }

before(async () => {
  await Nameserver.destroy({ id: testCase.id })
  await Nameserver.create(testCase)
})

after(async () => {
  await Nameserver.destroy({ id: testCase.id })
  await Nameserver.disconnect()
})

describe('nameserver (mysql)', function () {
  it('handles null export interval gracefully', async () => {
    await Nameserver.mysql.execute(
      'UPDATE nt_nameserver SET export_interval = NULL WHERE nt_nameserver_id = ?',
      [testCase.id],
    )

    const ns = await Nameserver.get({ id: testCase.id })
    assert.equal(ns[0].export.interval, undefined)

    await Nameserver.mysql.execute(
      'UPDATE nt_nameserver SET export_interval = ? WHERE nt_nameserver_id = ?',
      [testCase.export.interval, testCase.id],
    )
  })
})
