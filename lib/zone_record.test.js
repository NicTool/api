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
  it('GET by id', async () => {
    const zrs = await ZoneRecord.get({ id: testCase.id })
    delete zrs[0].last_modified
    assert.deepEqual(zrs[0], testCase)
  })

  it('GET by name', async () => {
    const zrs = await ZoneRecord.get({ zone_record: testCase.zone_record })
    delete zrs[0].last_modified
    assert.deepEqual(zrs[0], testCase)
  })

  it('PUT makes changes', async () => {
    assert.ok(await ZoneRecord.put({ id: testCase.id, address: '2.2.2.2' }))
    const zrs = await ZoneRecord.get({ id: testCase.id })
    assert.deepEqual(zrs[0].address, '2.2.2.2')
    assert.ok(
      await ZoneRecord.put({ id: testCase.id, address: testCase.address }),
    )
  })

  describe('DELETE', async () => {
    it('deletes a zr', async () => {
      assert.ok(await ZoneRecord.delete({ id: testCase.id }))
    })
    it('deleted zr is not found', async () => {
      let zrs = await ZoneRecord.get({ id: testCase.id })
      assert.equal(zrs.length, 0)
    })
    it('deleted zr can be retrieved', async () => {
      let zrs = await ZoneRecord.get({ id: testCase.id, deleted: true })
      assert.equal(zrs[0]?.deleted, true)
    })
    it('deleted record can be restored', async () => {
      await ZoneRecord.delete({ id: testCase.id, deleted: false }) // restore
      let zrs = await ZoneRecord.get({ id: testCase.id })
      assert.equal(zrs[0].deleted, undefined)
    })
  })
})
