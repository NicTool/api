import fs from 'node:fs'
import path from 'node:path'

import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import ZoneRecord from '../index.js'

after(async () => {
  // await ZoneRecord.destroy({ id: testCase.id })
  ZoneRecord.mysql.disconnect()
})

describe('zone_record', function () {
  it('CREATE accepts omitted ttl and stores 0', async () => {
    const testCase = {
      id: 60001,
      zid: 1,
      owner: 'missing-ttl.example.com.',
      type: 'A',
      address: '203.0.113.45',
    }

    await ZoneRecord.destroy({ id: testCase.id })

    try {
      await ZoneRecord.create(testCase)
      const zrs = await ZoneRecord.get({ id: testCase.id })
      assert.equal(zrs[0].ttl, 0)
      assert.equal(zrs[0].owner, testCase.owner)
      assert.equal(zrs[0].type, testCase.type)
    } finally {
      await ZoneRecord.destroy({ id: testCase.id })
    }
  })

  for (const rrType of fs.readdirSync('lib/zone_record/test/rrs')) {
    // if (rrType !== 'tlsa.json') continue
    describe(`${path.basename(rrType, '.json').toUpperCase()}`, function () {
      let testCase

      before(async () => {
        testCase = JSON.parse(fs.readFileSync(`lib/zone_record/test/rrs/${rrType}`))
        await ZoneRecord.destroy({ id: testCase.id })
        await ZoneRecord.create(testCase)
      })

      after(async () => {
        await ZoneRecord.destroy({ id: testCase.id })
      })

      it('GET by id', async () => {
        const zrs = await ZoneRecord.get({ id: testCase.id })
        delete zrs[0].last_modified
        assert.deepEqual(zrs[0], testCase)
      })

      it('GET by name', async () => {
        const zrs = await ZoneRecord.get({
          owner: testCase.owner,
          type: testCase.type,
          zid: testCase.zid,
        })
        delete zrs[0].last_modified
        assert.deepEqual(zrs[0], testCase)
      })

      it('PUT makes changes', async () => {
        assert.ok(await ZoneRecord.put({ id: testCase.id, ttl: 3600 }))
        const zrs = await ZoneRecord.get({ id: testCase.id })
        assert.deepEqual(zrs[0].ttl, 3600)
        assert.ok(await ZoneRecord.put({ id: testCase.id, ttl: testCase.ttl }))
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
  }
})
