import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'
import Zone from '../lib/zone.js'
import ZoneRecord from '../lib/zone_record.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import zoneCase from './test/zone.json' with { type: 'json' }

let server
const createdZoneRecordIds = []

const testGroupId = 5094
const testZoneId = 5095
const testZoneRecordId = 5096

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

before(async () => {
  await ZoneRecord.destroy({ id: testZoneRecordId })
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
  await Zone.create(testZone)
  await ZoneRecord.create(testZoneRecord)

  server = await init()
})

after(async () => {
  for (const id of createdZoneRecordIds) {
    await ZoneRecord.destroy({ id })
  }
  await ZoneRecord.destroy({ id: testZoneRecordId })
  await Zone.destroy({ id: testZoneId })
  await server.stop()
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

  it('DELETE /session', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/session',
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })
})
