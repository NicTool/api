import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import * as RR from '@nictool/dns-resource-record'

import ZoneRecord from '../index.js'
import { checkRecord, rdataFields } from '../store/base.js'

const id = 60303
const record = { id, zid: 4096, owner: 'legacy.example.com.', ttl: 300, type: 'A', address: '203.0.113.10' }

// valid rdata of a type the library maps nothing into address for, while one is left
function unheldRdata() {
  for (const type of Object.keys(RR.typeMap).filter((t) => isNaN(t) && RR[t])) {
    if (RR.getMap(type)?.address !== undefined || rdataFields(type).includes('address')) continue
    const rdata = new RR[type](null).getCanonical()
    for (const f of ['owner', 'ttl', 'class']) delete rdata[f]
    try {
      checkRecord({ ...rdata, owner: record.owner, ttl: record.ttl })
      return rdata
    } catch {
      // a type its own rules refuse here can't show the mysql refusal
    }
  }
}

before(async () => {
  await ZoneRecord.destroy({ id })
  await ZoneRecord.create(record)
})

after(async () => {
  await ZoneRecord.destroy({ id })
  await ZoneRecord.disconnect()
})

describe('zone_record (mysql)', function () {
  it('drops a legacy priority on a type change', async () => {
    await ZoneRecord.mysql.execute('UPDATE nt_zone_record SET priority = 5 WHERE nt_zone_record_id = ?', [id])
    assert.ok(await ZoneRecord.put({ id, type: 'MX', preference: 10, exchange: 'mail.example.com.' }))
    const [zr] = await ZoneRecord.get({ id })
    assert.equal(zr.priority, undefined)
    assert.equal(zr.preference, 10)
  })

  it('refuses a type change into a type mysql cannot hold', async (t) => {
    const rdata = unheldRdata()
    if (!rdata) return t.skip('every type has a column map')
    await assert.rejects(ZoneRecord.put({ id, ...rdata }), /can't be stored in mysql/)
  })

  it('refuses a create with incomplete rdata as invalid', async () => {
    await assert.rejects(ZoneRecord.create({ ...record, id: id + 1, type: 'MX' }), { code: 'STORE_INVALID' })
  })

  it('leaves fields the new type does not map out of the update', async () => {
    assert.ok(await ZoneRecord.put({ id, type: 'A', address: '203.0.113.11', port: 443 }))
    const [zr] = await ZoneRecord.get({ id })
    assert.equal(zr.address, '203.0.113.11')
  })

  it('writes every column on a type change, even one that looks unchanged', async (t) => {
    await ZoneRecord.put({ id, type: 'TXT', data: '203.0.113.7' })
    const [stale] = await ZoneRecord.get({ id })
    await ZoneRecord.put({ id, data: 'verification-token' })
    const get = ZoneRecord.get.bind(ZoneRecord)
    t.mock.method(ZoneRecord, 'get', async (args) => (args.deleted ? [] : [stale]))
    assert.ok(await ZoneRecord.put({ id, type: 'A', address: '203.0.113.7' }))
    t.mock.restoreAll()
    const [zr] = await get({ id })
    assert.equal(zr.type, 'A')
    assert.equal(zr.address, '203.0.113.7')
  })

  it('keeps a ttl changed while a type change was merging', async (t) => {
    const [stale] = await ZoneRecord.get({ id })
    await ZoneRecord.put({ id, ttl: 600 })
    const get = ZoneRecord.get.bind(ZoneRecord)
    t.mock.method(ZoneRecord, 'get', async (args) => (args.deleted ? [] : [stale]))
    assert.ok(await ZoneRecord.put({ id, type: 'MX', preference: 10, exchange: 'mail.example.com.' }))
    t.mock.restoreAll()
    const [zr] = await get({ id })
    assert.equal(zr.type, 'MX')
    assert.equal(zr.ttl, 600)
  })

  it('answers false when the record is destroyed during the update', async (t) => {
    const [stale] = await ZoneRecord.get({ id })
    t.mock.method(ZoneRecord, 'get', async (args) => (args.deleted ? [] : [{ ...stale, id: id + 2 }]))
    assert.equal(await ZoneRecord.put({ id: id + 2, ttl: 900 }), false)
  })

  it('does not read an old column back as HTTPS params', async () => {
    await ZoneRecord.put({ id, type: 'A', address: '203.0.113.10' })
    await ZoneRecord.mysql.execute("UPDATE nt_zone_record SET other = 'junk' WHERE nt_zone_record_id = ?", [
      id,
    ])
    assert.ok(await ZoneRecord.put({ id, type: 'HTTPS', priority: 1, 'target name': 'svc.example.com.' }))
    const [zr] = await ZoneRecord.get({ id })
    assert.equal(zr.params, undefined)
  })

  it('edits a stored SRV whose priority is NULL only into a valid record', async () => {
    await ZoneRecord.put({ id, type: 'SRV', priority: 5, weight: 5, port: 5060, target: 'sip.example.com.' })
    await ZoneRecord.mysql.execute('UPDATE nt_zone_record SET priority = NULL WHERE nt_zone_record_id = ?', [
      id,
    ])
    const [stored] = await ZoneRecord.get({ id })
    assert.ok(await ZoneRecord.put({ id, ttl: stored.ttl + 1 }))
    assert.equal((await ZoneRecord.get({ id }))[0].ttl, stored.ttl + 1)
    await assert.rejects(ZoneRecord.put({ ...stored, ttl: stored.ttl + 2 }), { code: 'STORE_INVALID' })
    await assert.rejects(ZoneRecord.put({ id, port: 5061 }), { code: 'STORE_INVALID' })
    assert.ok(await ZoneRecord.put({ id, priority: 5, port: 5061 }))
    assert.equal((await ZoneRecord.get({ id }))[0].port, 5061)
  })

  it('does not write rdata merged against a type that has since changed', async (t) => {
    await ZoneRecord.put({ id, type: 'MX', preference: 10, exchange: 'mail.example.com.' })
    const [stale] = await ZoneRecord.get({ id })
    await ZoneRecord.put({ id, type: 'A', address: '203.0.113.10' })
    const get = ZoneRecord.get.bind(ZoneRecord)
    t.mock.method(ZoneRecord, 'get', async (args) => (args.deleted ? [] : [stale]))
    await assert.rejects(ZoneRecord.put({ id, exchange: 'other.example.com.' }), { code: 'STORE_CONFLICT' })
    t.mock.restoreAll()
    const [zr] = await get({ id })
    assert.equal(zr.type, 'A')
    assert.equal(zr.address, '203.0.113.10')
  })
})
