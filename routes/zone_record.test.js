import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'
import ZoneRecord from '../lib/zone_record/index.js'
import Delegation from '../lib/delegation/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import { grantGroupPermissions } from './test/permissions.js'
import userCase from './test/user.json' with { type: 'json' }
import zoneCase from './test/zone.json' with { type: 'json' }

let server
const createdZoneRecordIds = []

const testGroupId = 5094
const testZoneId = 5095
const testZoneRecordId = 5096
const deletedParentRecordId = 5097
const delegatedGroupId = 5098
const delegatedZoneId = 5099
const delegatedRecordId = 5100
const hiddenRecordId = 5101

const testZone = {
  ...zoneCase,
  id: testZoneId,
  gid: testGroupId,
  zone: 'route-zr-delete.example.com',
}

const testZoneRecord = {
  id: testZoneRecordId,
  zid: testZoneId,
  owner: 'www.route-zr-delete.example.com.',
  ttl: 300,
  type: 'A',
  address: '203.0.113.6',
}

const deletedParentRecord = {
  ...testZoneRecord,
  id: deletedParentRecordId,
  owner: 'deleted-parent.route-zr-delete.example.com.',
}

const delegatedZone = {
  ...zoneCase,
  id: delegatedZoneId,
  gid: delegatedGroupId,
  zone: 'delegated-scope.route.example.com',
}

const delegatedRecord = {
  ...testZoneRecord,
  id: delegatedRecordId,
  zid: delegatedZoneId,
  owner: 'allowed.delegated-scope.route.example.com.',
}

const hiddenRecord = {
  ...delegatedRecord,
  id: hiddenRecordId,
  owner: 'hidden.delegated-scope.route.example.com.',
}

before(async () => {
  await Delegation.delete({ gid: testGroupId, oid: delegatedRecordId, type: 'ZONERECORD' })
  await ZoneRecord.destroy({ id: delegatedRecordId })
  await ZoneRecord.destroy({ id: hiddenRecordId })
  await Zone.destroy({ id: delegatedZoneId })
  await Group.destroy({ id: delegatedGroupId })
  await ZoneRecord.destroy({ id: testZoneRecordId })
  await ZoneRecord.destroy({ id: deletedParentRecordId })
  await Zone.destroy({ id: testZoneId })

  const testGroup = { ...groupCase, id: testGroupId }
  const testUser = {
    ...userCase,
    id: testGroupId,
    gid: testGroupId,
    email: 'route-zr-delete@example.com',
    username: `route-zr-delete-${testGroupId}`,
  }

  await Group.create(testGroup)
  await User.create(testUser)
  await grantGroupPermissions(testGroup.id)
  await Zone.create(testZone)
  await ZoneRecord.create(testZoneRecord)
  await ZoneRecord.create(deletedParentRecord)
  await Group.create({
    ...groupCase,
    id: delegatedGroupId,
    name: 'delegated-owner',
  })
  await Zone.create(delegatedZone)
  await ZoneRecord.create(delegatedRecord)
  await ZoneRecord.create(hiddenRecord)
  await Delegation.create({
    gid: testGroupId,
    oid: delegatedRecordId,
    type: 'ZONERECORD',
    delegated_by_id: testGroupId,
    delegated_by_name: `route-zr-delete-${testGroupId}`,
  })

  server = await init()
})

after(async () => {
  await Delegation.delete({ gid: testGroupId, oid: delegatedRecordId, type: 'ZONERECORD' })
  await ZoneRecord.destroy({ id: delegatedRecordId })
  await ZoneRecord.destroy({ id: hiddenRecordId })
  await Zone.destroy({ id: delegatedZoneId })
  await Group.destroy({ id: delegatedGroupId })
  for (const id of createdZoneRecordIds) {
    await ZoneRecord.destroy({ id })
  }
  await ZoneRecord.destroy({ id: testZoneRecordId })
  await ZoneRecord.destroy({ id: deletedParentRecordId })
  await Zone.destroy({ id: testZoneId })
  if (server) await server.stop()
})

describe('zone_record routes', () => {
  let auth = { headers: {} }

  it('POST /session establishes a session', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/session',
      payload: {
        username: `route-zr-delete-${testGroupId}@${groupCase.name}`,
        password: userCase.password,
      },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(res.result.session.token)
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it('GET /log/zone_record requires zid', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/log/zone_record',
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 400)
  })

  it('POST /zone_record creates and returns array payload', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone_record',
      headers: auth.headers,
      payload: {
        zid: testZoneId,
        owner: 'new.route-zr-delete.example.com.',
        ttl: 300,
        type: 'A',
        address: '203.0.113.7',
      },
    })

    assert.equal(res.statusCode, 201)
    assert.ok(Array.isArray(res.result.zone_record))
    assert.equal(res.result.zone_record.length, 1)
    assert.equal(res.result.zone_record[0].type, 'A')
    assert.equal(res.result.zone_record[0].owner, 'new.route-zr-delete.example.com.')

    createdZoneRecordIds.push(res.result.zone_record[0].id)
  })

  it('limits a delegated zone collection to delegated records', async () => {
    const zones = await server.inject({
      method: 'GET',
      url: `/zone?gid=${testGroupId}&search=delegated-scope`,
      headers: auth.headers,
    })
    assert.equal(zones.statusCode, 200)
    assert.deepEqual(
      zones.result.zone.map((zone) => zone.id),
      [delegatedZoneId],
    )
    assert.equal(zones.result.meta.pagination.total, 2)
    assert.equal(zones.result.meta.pagination.filtered, 1)

    const records = await server.inject({
      method: 'GET',
      url: `/zone_record?zid=${delegatedZoneId}`,
      headers: auth.headers,
    })
    assert.equal(records.statusCode, 200)
    assert.deepEqual(
      records.result.zone_record.map((record) => record.id),
      [delegatedRecordId],
    )
    assert.equal(records.result.meta.pagination.total, 1)
    assert.equal(records.result.meta.pagination.filtered, 1)
  })

  it('POST /zone_record accepts omitted ttl and stores 0', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone_record',
      headers: auth.headers,
      payload: {
        zid: testZoneId,
        owner: 'default-ttl.route-zr-delete.example.com.',
        type: 'A',
        address: '203.0.113.8',
      },
    })

    assert.equal(res.statusCode, 201)
    assert.ok(Array.isArray(res.result.zone_record))
    assert.equal(res.result.zone_record.length, 1)
    assert.equal(res.result.zone_record[0].ttl, 0)
    assert.equal(res.result.zone_record[0].owner, 'default-ttl.route-zr-delete.example.com.')

    createdZoneRecordIds.push(res.result.zone_record[0].id)
  })

  it('GET /zone_record paginates and returns meta.pagination', async () => {
    const token = 'pgtest'
    for (let i = 0; i < 3; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/zone_record',
        headers: auth.headers,
        payload: {
          zid: testZoneId,
          owner: `${token}${i}.route-zr-delete.example.com.`,
          ttl: 300,
          type: 'A',
          address: `203.0.113.${20 + i}`,
        },
      })
      createdZoneRecordIds.push(res.result.zone_record[0].id)
    }

    const res = await server.inject({
      method: 'GET',
      url: `/zone_record?zid=${testZoneId}&search=${token}&limit=2&sort_by=owner&sort_dir=asc`,
      headers: auth.headers,
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone_record.length, 2)
    assert.equal(res.result.zone_record[0].owner, `${token}0.route-zr-delete.example.com.`)
    assert.equal(res.result.meta.pagination.filtered, 3)
    assert.equal(res.result.meta.pagination.limit, 2)
    assert.equal(res.result.meta.pagination.offset, 0)
    assert.ok(res.result.meta.pagination.total >= 3)

    const byAddress = await server.inject({
      method: 'GET',
      url: `/zone_record?zid=${testZoneId}&search=${token}&sort_by=address&sort_dir=desc`,
      headers: auth.headers,
    })
    assert.equal(byAddress.statusCode, 200)
    assert.equal(byAddress.result.zone_record[0].address, '203.0.113.22')
  })

  it(`DELETE /zone_record/${testZoneRecordId} soft-deletes record`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone_record/${testZoneRecordId}`,
      headers: auth.headers,
    })

    assert.equal(res.statusCode, 200)
    assert.ok(Array.isArray(res.result.zone_record))
    assert.equal(res.result.zone_record[0].id, testZoneRecordId)
    assert.equal(res.result.zone_record[0].deleted, true)

    const log = await server.inject({
      method: 'GET',
      url: `/log/zone_record?zid=${testZoneId}&search=www.route-zr-delete`,
      headers: auth.headers,
    })
    assert.equal(log.statusCode, 200)
    assert.equal(log.result.log[0].action, 'deleted')
    assert.equal(log.result.log[0].owner, testZoneRecord.owner)
  })

  it(`GET /zone_record/${testZoneRecordId} hides deleted by default`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone_record/${testZoneRecordId}`,
      headers: auth.headers,
    })

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.zone_record, [])
  })

  it(`GET /zone_record/${testZoneRecordId}?deleted=true returns soft-deleted record`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone_record/${testZoneRecordId}?deleted=true`,
      headers: auth.headers,
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone_record[0].id, testZoneRecordId)
    assert.equal(res.result.zone_record[0].deleted, true)
  })

  it(`DELETE /zone_record/${testZoneRecordId} returns 404 when already deleted`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone_record/${testZoneRecordId}`,
      headers: auth.headers,
    })

    assert.equal(res.statusCode, 404)
  })

  it('DELETE /zone_record logs against a soft-deleted parent zone', async () => {
    await Zone.delete({ id: testZoneId, deleted: true })
    let res
    try {
      res = await server.inject({
        method: 'DELETE',
        url: `/zone_record/${deletedParentRecordId}`,
        headers: auth.headers,
      })
    } finally {
      await Zone.delete({ id: testZoneId, deleted: false })
    }

    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone_record[0].id, deletedParentRecordId)
    assert.equal(res.result.zone_record[0].deleted, true)
  })

  it('DELETE /session', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/session',
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })
})
