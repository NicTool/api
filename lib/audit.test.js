import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import Audit from './audit/index.js'
import Group from './group/index.js'
import User from './user/index.js'
import Zone from './zone/index.js'
import ZoneRecord from './zone_record/index.js'

const gid = 6190
const zid = 6190
const zrid = 6190
const actor = { id: 6190 }
const zone = {
  id: zid,
  gid,
  zone: 'audit.example.com.',
  mailaddr: 'hostmaster.audit.example.com.',
  serial: 1,
  refresh: 3600,
  retry: 900,
  expire: 604800,
  minimum: 86400,
  ttl: 3600,
}
const record = {
  id: zrid,
  zid,
  owner: 'www.audit.example.com.',
  type: 'A',
  address: '192.0.2.19',
  ttl: 300,
}

before(async () => {
  await Audit.destroyByUser(actor.id)
  await ZoneRecord.destroy({ id: zrid })
  await Zone.destroy({ id: zid })
  await User.destroy({ id: actor.id })
  await Group.destroy({ id: gid })
  await Group.create({ id: gid, parent_gid: 0, name: 'audit-test' })
  await User.create({
    id: actor.id,
    gid,
    username: 'audit-test',
    email: 'audit-test@example.com',
    password: 'Wh@tA-Decent#P6ssw0rd',
    first_name: 'Audit',
    last_name: 'Tester',
  })
  await Zone.create(zone)
  await ZoneRecord.create(record)
})

after(async () => {
  await Audit.destroyByUser(actor.id)
  await ZoneRecord.destroy({ id: zrid })
  await Zone.destroy({ id: zid })
  await User.destroy({ id: actor.id })
  await Group.destroy({ id: gid })
  await Group.disconnect()
})

describe('audit log', () => {
  it('records and lists zone changes', async () => {
    await Audit.logZone(actor, 'added', zone)
    const result = await Audit.listZones({ gids: [gid], search: 'audit.example.com.' })
    assert.equal(result.filtered, 1)
    assert.equal(result.rows[0].action, 'added')
    assert.equal(result.rows[0].zone, zone.zone)
    assert.equal(result.rows[0].zid, zid)
  })

  it('records and lists zone-record changes with their type', async () => {
    const id = await Audit.logZoneRecord(actor, 'deleted', record, zone)
    const result = await Audit.listZoneRecords({ zid, search: 'www.audit' })
    assert.equal(result.filtered, 1)
    assert.equal(result.rows[0].action, 'deleted')
    assert.equal(result.rows[0].owner, record.owner)
    assert.equal(result.rows[0].type, 'A')

    const exact = await Audit.listZoneRecords({ zid, id })
    assert.equal(exact.total, 1)
    assert.equal(exact.rows[0].id, id)
    assert.equal((await Audit.listZoneRecords({ zid, id: id + 1 })).total, 0)
  })

  it('lists the actor global log with stable pagination', async () => {
    const result = await Audit.listGlobal({ gids: [gid], limit: 1, offset: 0 })
    assert.equal(result.total, 2)
    assert.equal(result.filtered, 2)
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].uid, actor.id)

    assert.equal((await Audit.listGlobal({ gids: [gid], uid: actor.id })).total, 2)
    assert.equal((await Audit.listGlobal({ gids: [gid], uid: actor.id + 1 })).total, 0)
  })
})
