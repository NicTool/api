import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import ZoneRecord from './zone_record.js'

import testCase from './test/zone_record.json' with { type: 'json' }

before(async () => {
  await ZoneRecord.destroy({ id: testCase.id })
  await ZoneRecord.create(testCase)
})

after(async () => {
  // await ZoneRecord.destroy({ id: testCase.id })
  ZoneRecord.mysql.disconnect()
})

describe('zone_record', function () {
  it('gets zone_record by id', async () => {
    const g = await ZoneRecord.get({ id: testCase.id })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('gets zone_record by name', async () => {
    const g = await ZoneRecord.get({ zone_record: testCase.zone_record })
    delete g[0].last_modified
    assert.deepEqual(g[0], testCase)
  })

  it('changes a zone_record', async () => {
    assert.ok(
      await ZoneRecord.put({ id: testCase.id, address: '2.2.2.2' }),
    )
    const ns = await ZoneRecord.get({ id: testCase.id })
    assert.deepEqual(ns[0].address, '2.2.2.2')
    assert.ok(await ZoneRecord.put({ id: testCase.id, address: testCase.address }))
  })

  it('deletes a zone_record', async () => {
    assert.ok(await ZoneRecord.delete({ id: testCase.id }))
    let g = await ZoneRecord.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await ZoneRecord.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await ZoneRecord.get({ id: testCase.id })
    assert.equal(g[0].deleted, false)
  })
})
