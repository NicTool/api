import fs from 'node:fs'
import path from 'node:path'

import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import ZoneRecord from '../index.js'

after(async () => {
  // await ZoneRecord.destroy({ id: testCase.id })
  await ZoneRecord.disconnect()
})

describe('zone_record', function () {
  it('CREATE accepts omitted ttl and stores 0', async () => {
    const testCase = {
      id: 60001,
      zid: 4096, // the fixture zone, as the rrs/*.json cases use
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
        delete zrs[0].last_modified
        assert.deepEqual(zrs[0], { ...testCase, ttl: 3600 })
        assert.ok(await ZoneRecord.put({ id: testCase.id, ttl: testCase.ttl }))
      })

      it('PUT accepts the whole record in RFC fields', async () => {
        assert.ok(await ZoneRecord.put({ ...testCase, ttl: testCase.ttl + 1 }))
        const zrs = await ZoneRecord.get({ id: testCase.id })
        delete zrs[0].last_modified
        assert.deepEqual(zrs[0], { ...testCase, ttl: testCase.ttl + 1 })
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

  describe('PUT of part of the rdata', function () {
    const naptr = JSON.parse(fs.readFileSync('lib/zone_record/test/rrs/naptr.json'))
    const base = { id: 60301, zid: 4096, owner: 'retype.example.com.', ttl: 300 }

    before(async () => {
      await ZoneRecord.destroy({ id: naptr.id })
      await ZoneRecord.create(naptr)
    })

    after(async () => {
      await ZoneRecord.destroy({ id: naptr.id })
      await ZoneRecord.destroy({ id: base.id })
    })

    it('keeps the NAPTR fields that share a column', async () => {
      assert.ok(await ZoneRecord.put({ id: naptr.id, regexp: '!^.*$!sip:info@example.com!' }))
      const [zr] = await ZoneRecord.get({ id: naptr.id })
      delete zr.last_modified
      assert.deepEqual(zr, { ...naptr, regexp: '!^.*$!sip:info@example.com!' })
    })

    it('drops the old rdata when the type changes', async () => {
      await ZoneRecord.destroy({ id: base.id })
      await ZoneRecord.create({ ...base, type: 'A', address: '203.0.113.7' })
      assert.ok(
        await ZoneRecord.put({ id: base.id, type: 'MX', preference: 10, exchange: 'mail.example.com.' }),
      )
      const [zr] = await ZoneRecord.get({ id: base.id })
      delete zr.last_modified
      assert.deepEqual(zr, { ...base, type: 'MX', preference: 10, exchange: 'mail.example.com.' })
    })

    it('drops the old rdata when the whole record comes back with a new type', async () => {
      await ZoneRecord.destroy({ id: base.id })
      await ZoneRecord.create({
        ...base,
        type: 'SRV',
        priority: 5,
        weight: 10,
        port: 5060,
        target: 'sip.example.com.',
      })
      const [stored] = await ZoneRecord.get({ id: base.id })
      assert.ok(await ZoneRecord.put({ ...stored, type: 'A', address: '203.0.113.9' }))
      const [zr] = await ZoneRecord.get({ id: base.id })
      delete zr.last_modified
      assert.deepEqual(zr, { ...base, type: 'A', address: '203.0.113.9' })
    })

    it('refuses a type change that leaves the new type incomplete', async () => {
      await ZoneRecord.destroy({ id: base.id })
      await ZoneRecord.create({ ...base, type: 'A', address: '203.0.113.7' })
      await assert.rejects(ZoneRecord.put({ id: base.id, type: 'MX' }), /preference is required/)
      const [zr] = await ZoneRecord.get({ id: base.id })
      assert.equal(zr.type, 'A')
      assert.equal(zr.address, '203.0.113.7')
    })

    it('refuses rdata that the record type cannot hold', async () => {
      const soa = { ...JSON.parse(fs.readFileSync('lib/zone_record/test/rrs/soa.json')), id: base.id }
      await ZoneRecord.destroy({ id: base.id })
      await ZoneRecord.create(soa)
      await assert.rejects(ZoneRecord.put({ id: base.id, serial: 'abc' }), { code: 'STORE_INVALID' })
      assert.equal((await ZoneRecord.get({ id: base.id }))[0].serial, soa.serial)
    })

    it('takes a NAPTR with an empty regexp', async () => {
      const [before] = await ZoneRecord.get({ id: naptr.id })
      const { regexp, ...rest } = before
      await ZoneRecord.destroy({ id: naptr.id })
      assert.ok(regexp !== undefined)
      await ZoneRecord.create({ ...rest, id: naptr.id })
      assert.equal((await ZoneRecord.get({ id: naptr.id }))[0].regexp ?? '', '')
      await ZoneRecord.destroy({ id: naptr.id })
      await ZoneRecord.create(naptr)
    })

    it('refuses a NAPTR field holding the column delimiter', async () => {
      const [before] = await ZoneRecord.get({ id: naptr.id })
      await assert.rejects(ZoneRecord.put({ id: naptr.id, service: "SIP+D2U','x" }), {
        code: 'STORE_INVALID',
      })
      await assert.rejects(ZoneRecord.put({ id: naptr.id, service: "foo'," }), { code: 'STORE_INVALID' })
      assert.equal((await ZoneRecord.get({ id: naptr.id }))[0].regexp, before.regexp)
    })

    it('drops a NAPTR replacement when the type changes', async () => {
      assert.ok(await ZoneRecord.put({ id: naptr.id, type: 'A', address: '203.0.113.8' }))
      const [zr] = await ZoneRecord.get({ id: naptr.id })
      delete zr.last_modified
      assert.deepEqual(zr, {
        id: naptr.id,
        zid: naptr.zid,
        owner: naptr.owner,
        ttl: naptr.ttl,
        type: 'A',
        address: '203.0.113.8',
      })
    })
  })

  describe('a type change leaves only the new rdata', function () {
    const id = 60302
    after(async () => {
      await ZoneRecord.destroy({ id })
    })

    for (const rrType of fs.readdirSync('lib/zone_record/test/rrs')) {
      it(`${path.basename(rrType, '.json').toUpperCase()} to A`, async () => {
        const testCase = { ...JSON.parse(fs.readFileSync(`lib/zone_record/test/rrs/${rrType}`)), id }
        await ZoneRecord.destroy({ id })
        await ZoneRecord.create(testCase)
        assert.ok(await ZoneRecord.put({ id, type: 'A', address: '203.0.113.9' }))
        const [zr] = await ZoneRecord.get({ id })
        delete zr.last_modified
        const { zid, owner, ttl } = testCase
        assert.deepEqual(zr, { id, zid, owner, ttl, type: 'A', address: '203.0.113.9' })
      })
    }
  })

  describe('pagination, search & sort', function () {
    // Tests run against a shared DB; a unique owner token isolates these
    // assertions from any other records that already exist in the zone.
    //
    // The zone has to be one the fixtures create
    const pZid = 4096 // the fixture zone, as the rrs/*.json cases use
    const token = 'zrpgtok'
    const letters = ['ccc', 'aaa', 'eee', 'bbb', 'ddd'] // created out of sorted order
    const idBase = 60210
    const label = (r) => r.owner.split('.')[0].replace(`${token}-`, '')

    before(async () => {
      for (let i = 0; i < letters.length; i++) {
        await ZoneRecord.destroy({ id: idBase + i })
        await ZoneRecord.create({
          id: idBase + i,
          zid: pZid,
          owner: `${token}-${letters[i]}.example.com.`,
          type: 'A',
          address: `203.0.113.${10 + i}`,
          ttl: 300,
        })
      }
    })

    after(async () => {
      for (let i = 0; i < letters.length; i++) await ZoneRecord.destroy({ id: idBase + i })
    })

    it('sorts by owner ascending and descending', async () => {
      const asc = await ZoneRecord.get({ zid: pZid, search: token, sort_by: 'owner', sort_dir: 'asc' })
      assert.deepEqual(asc.map(label), ['aaa', 'bbb', 'ccc', 'ddd', 'eee'])
      const desc = await ZoneRecord.get({ zid: pZid, search: token, sort_by: 'owner', sort_dir: 'desc' })
      assert.deepEqual(desc.map(label), ['eee', 'ddd', 'ccc', 'bbb', 'aaa'])
    })

    it('paginates with limit/offset over a stable sort', async () => {
      const page1 = await ZoneRecord.get({ zid: pZid, search: token, sort_by: 'owner', limit: 2, offset: 0 })
      const page2 = await ZoneRecord.get({ zid: pZid, search: token, sort_by: 'owner', limit: 2, offset: 2 })
      assert.deepEqual(page1.map(label), ['aaa', 'bbb'])
      assert.deepEqual(page2.map(label), ['ccc', 'ddd'])
    })

    it('filters by search on owner', async () => {
      const zrs = await ZoneRecord.get({ zid: pZid, search: `${token}-bbb` })
      assert.equal(zrs.length, 1)
      assert.match(zrs[0].owner, new RegExp(`^${token}-bbb\\.`))
    })

    it('count reflects the search filter', async () => {
      assert.equal(await ZoneRecord.count({ zid: pZid, search: token }), 5)
      assert.equal(await ZoneRecord.count({ zid: pZid, search: `${token}-bbb` }), 1)
    })
  })
})
