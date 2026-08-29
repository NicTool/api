import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Audit from '../index.js'
import Group from '../../group/index.js'
import User from '../../user/index.js'
import Zone from '../../zone/index.js'
import ZoneRecord from '../../zone_record/index.js'

import groupCase from '../../group/test/group.json' with { type: 'json' }
import userCase from '../../user/test/user.json' with { type: 'json' }

const zone = { id: 4300, gid: groupCase.id, zone: 'audit.example.com.' }
const seen = {
  id: 4301,
  zid: zone.id,
  owner: 'seen.audit.example.com.',
  type: 'A',
  address: '192.0.2.1',
  ttl: 3600,
}
const hidden = {
  id: 4302,
  zid: zone.id,
  owner: 'hidden.audit.example.com.',
  type: 'A',
  address: '192.0.2.2',
  ttl: 3600,
}

before(async () => {
  await Group.create(groupCase)
  await User.create(userCase)
  await Zone.destroy({ id: zone.id })
  await Zone.create({
    ...zone,
    mailaddr: 'hostmaster.audit.example.com.',
    serial: 1,
    refresh: 1,
    retry: 1,
    expire: 1,
    minimum: 1,
    ttl: 1,
  })
  for (const record of [seen, hidden]) {
    await ZoneRecord.destroy({ id: record.id })
    await ZoneRecord.create(record)
    await Audit.logZoneRecord(userCase, 'added', record, zone)
  }
})

after(async () => {
  for (const record of [seen, hidden]) await ZoneRecord.destroy({ id: record.id })
  await Zone.destroy({ id: zone.id })
  await Zone.disconnect()
})

describe('audit', () => {
  it('lists every record log row in a zone', async () => {
    const { rows } = await Audit.listZoneRecords({ zid: zone.id, search: 'audit.example.com' })
    assert.deepEqual(rows.map((r) => r.zrid).sort(), [seen.id, hidden.id])
  })

  it('limits record log rows to the ids a caller may read', async () => {
    const { rows } = await Audit.listZoneRecords({ zid: zone.id, ids: [seen.id] })
    assert.deepEqual(
      rows.map((r) => r.zrid),
      [seen.id],
    )
  })

  it('keeps every row when writers overlap', async () => {
    const before = (await Audit.listZoneRecords({ zid: zone.id, ids: [seen.id] })).rows
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map(() => Audit.logZoneRecord(userCase, 'modified', seen, zone)),
    )
    assert.equal(new Set(ids).size, ids.length)
    const after = (await Audit.listZoneRecords({ zid: zone.id, ids: [seen.id] })).rows
    assert.equal(after.length, before.length + ids.length)
  })

  it('returns nothing for an empty read scope', async () => {
    const { rows } = await Audit.listZoneRecords({ zid: zone.id, ids: [] })
    assert.deepEqual(rows, [])
  })
})
