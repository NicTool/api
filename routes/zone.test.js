import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'
import Nameserver from '../lib/nameserver/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import { grantGroupPermissions } from './test/permissions.js'
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/zone.json' with { type: 'json' }
import nameserverCase from './test/nameserver.json' with { type: 'json' }

let server
let case2Id = 4094
const duplicateId = 4092
const duplicateCaseId = 4089
const concurrentDuplicateIds = [4087, 4088]
const recoveryDuplicateId = 4086

const subGroup = { id: 4090, parent_gid: groupCase.id, name: 'sub.route.example.com' }
const subZone = { ...nsCase, id: 4091, gid: subGroup.id, zone: 'sub.route.example.com.' }
// one nameserver in the caller's group, one it cannot use
const ownNs = { ...nameserverCase, id: 4093, gid: groupCase.id, name: 'own.ns.example.com.' }
const otherNs = { ...nameserverCase, id: 4092, gid: 1, name: 'other.ns.example.com.' }
const nsZoneId = 4089
const refusedZoneId = 4085

before(async () => {
  await Zone.destroy({ id: nsCase.id })
  await Zone.destroy({ id: case2Id })
  await Zone.destroy({ id: duplicateId })
  await Zone.destroy({ id: duplicateCaseId })
  await Zone.destroy({ id: recoveryDuplicateId })
  for (const id of concurrentDuplicateIds) await Zone.destroy({ id })
  await Zone.destroy({ id: subZone.id })
  // Destroy the subgroup before recreating it: a lingering row would make
  // Group.create early-return and skip addToSubgroups, leaving the
  // nt_group_subgroups closure row (and thus the include_subgroups query) empty.
  await Group.destroy({ id: subGroup.id })
  await Group.create(groupCase)
  // POST /zone (case2Id) targets a zone in this group; authz requires it to
  // exist inside the fixture user's group tree.
  await Group.create({ id: case2Id, parent_gid: groupCase.id, name: 'route2.example.com' })
  await User.create(userCase)
  await grantGroupPermissions(groupCase.id)
  await Zone.create(nsCase)
  await Group.create(subGroup)
  await Zone.create(subZone)
  await Zone.destroy({ id: nsZoneId })
  await Zone.destroy({ id: refusedZoneId })
  await Nameserver.destroy({ id: ownNs.id })
  await Nameserver.destroy({ id: otherNs.id })
  await Nameserver.create(ownNs)
  await Nameserver.create(otherNs)
  server = await init()
})

after(async () => {
  await Zone.destroy({ id: nsZoneId })
  await Nameserver.destroy({ id: ownNs.id })
  await Nameserver.destroy({ id: otherNs.id })
  await Zone.destroy({ id: duplicateId })
  await Zone.destroy({ id: duplicateCaseId })
  await Zone.destroy({ id: recoveryDuplicateId })
  for (const id of concurrentDuplicateIds) await Zone.destroy({ id })
  await Zone.destroy({ id: subZone.id })
  await Group.destroy({ id: subGroup.id })
  await Group.destroy({ id: case2Id })
  await server.stop()
})

describe('zone routes', () => {
  let auth = { headers: {} }

  it('POST /session establishes a session', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/session',
      payload: {
        username: `${userCase.username}@${groupCase.name}`,
        password: userCase.password,
      },
    })
    assert.ok(res.result.user.id)
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it(`GET /zone/${nsCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone[0].zone, nsCase.zone)
  })

  it('GET /zone?search=... returns DB matches', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/zone?search=route.example',
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.zone.some((z) => z.zone === nsCase.zone))
  })

  it('POST /zone rejects an active duplicate name', async () => {
    const duplicate = { ...nsCase, id: duplicateId, zone: `${nsCase.zone}.` }
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: duplicate,
    })

    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.result.zone, [])
    assert.match(res.result.meta.msg, /already taken/)
  })

  it('POST /zone rejects a case-only duplicate name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: { ...nsCase, id: duplicateCaseId, zone: `${nsCase.zone.toUpperCase()}.` },
    })
    await Zone.destroy({ id: duplicateCaseId })

    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.result.zone, [])
  })

  it('POST /zone admits only one concurrent canonical name', async () => {
    const responses = await Promise.all(
      concurrentDuplicateIds.map((id, index) =>
        server.inject({
          method: 'POST',
          url: '/zone',
          headers: auth.headers,
          payload: {
            ...nsCase,
            id,
            zone: index === 0 ? 'concurrent.example.com' : 'CONCURRENT.EXAMPLE.COM.',
          },
        }),
      ),
    )
    for (const id of concurrentDuplicateIds) await Zone.destroy({ id })

    assert.deepEqual(responses.map((res) => res.statusCode).sort(), [201, 409])
  })

  it('PUT /zone refuses recovery beside an active canonical name', async () => {
    await Zone.create({
      ...nsCase,
      id: recoveryDuplicateId,
      zone: `${nsCase.zone.toUpperCase()}.`,
      deleted: true,
    })

    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${recoveryDuplicateId}`,
      headers: auth.headers,
      payload: { deleted: false },
    })

    assert.equal(res.statusCode, 409)
    assert.equal((await Zone.get({ id: recoveryDuplicateId, deleted: true }))[0].deleted, true)
  })

  it(`PUT /zone/${nsCase.id} moves it to another group`, async () => {
    const moved = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { gid: case2Id },
    })
    assert.equal(moved.statusCode, 200)
    assert.equal(moved.result.zone[0].gid, case2Id)

    const restored = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { gid: groupCase.id },
    })
    assert.equal(restored.statusCode, 200)
    assert.equal(restored.result.zone[0].gid, groupCase.id)
  })

  it(`PUT /zone/${nsCase.id} validates serial and unknown fields`, async () => {
    const updated = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { serial: 2026082601 },
    })
    assert.equal(updated.statusCode, 200)
    assert.equal(updated.result.zone[0].serial, 2026082601)

    const unknown = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { definitely_not_a_zone_field: true },
    })
    assert.equal(unknown.statusCode, 400)
  })

  it(`PUT /zone/${nsCase.id} assigns a usable nameserver`, async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { nameservers: [ownNs.id, ownNs.id] },
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.zone[0].nameservers, [ownNs.id])

    const get = await server.inject({ method: 'GET', url: `/zone/${nsCase.id}`, headers: auth.headers })
    assert.deepEqual(get.result.zone[0].nameservers, [ownNs.id])
  })

  it(`PUT /zone/${nsCase.id} refuses a nameserver the caller cannot use`, async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { nameservers: [ownNs.id, otherNs.id] },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.meta.msg, /not usable: 4092/)
    assert.deepEqual(await Zone.nameserverIds(nsCase.id), [ownNs.id])
  })

  it(`PUT /zone/${nsCase.id} clears the assignment`, async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${nsCase.id}`,
      headers: auth.headers,
      payload: { nameservers: [] },
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.zone[0].nameservers, [])
  })

  it(`POST /zone (${nsZoneId}) with nameservers`, async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: { ...nsCase, id: nsZoneId, zone: 'ns.route.example.com.', nameservers: [ownNs.id] },
    })
    assert.equal(res.statusCode, 201)
    assert.deepEqual(res.result.zone[0].nameservers, [ownNs.id])
  })

  it('POST /zone rejects a nameserver the caller cannot use', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: { ...nsCase, id: refusedZoneId, zone: 'ns2.route.example.com.', nameservers: [otherNs.id] },
    })
    assert.equal(res.statusCode, 403)
    assert.equal((await Zone.get({ id: refusedZoneId })).length, 0)
  })

  it(`POST /zone (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    testCase.id = case2Id // make it unique
    testCase.gid = case2Id
    testCase.zone = 'route2.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
    assert.ok(res.result.zone[0].gid)

    const log = await server.inject({
      method: 'GET',
      url: `/log/zone?gid=${case2Id}&search=route2.example.com.`,
      headers: auth.headers,
    })
    assert.equal(log.statusCode, 200)
    assert.equal(log.result.log[0].action, 'added')
  })

  it(`GET /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.zone[0].gid)
  })

  it(`DELETE /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)

    const log = await server.inject({
      method: 'GET',
      url: `/log/zone?gid=${case2Id}&search=route2.example.com.`,
      headers: auth.headers,
    })
    assert.equal(log.statusCode, 200)
    assert.equal(log.result.log[0].action, 'deleted')
  })

  it('GET /log/global includes subgroup activity', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/log/global?gid=${groupCase.id}&include_subgroups=true&search=route2.example.com.`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.log.some((row) => row.title === 'route2.example.com.'))
  })

  it(`DELETE /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 404)
  })

  it(`GET /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.zone, [])
  })

  it(`GET /zone/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}?deleted=true`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.zone)
  })

  it('GET /zone?gid= excludes subgroup zones by default', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone?gid=${groupCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    const zones = res.result.zone.map((z) => z.zone)
    assert.ok(zones.includes(nsCase.zone))
    assert.ok(!zones.includes(subZone.zone))
  })

  it('GET /zone?gid=&include_subgroups=true spans the branch', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone?gid=${groupCase.id}&include_subgroups=true`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    const zones = res.result.zone.map((z) => z.zone)
    assert.ok(zones.includes(nsCase.zone), 'parent zone present')
    assert.ok(zones.includes(subZone.zone), 'subgroup zone present')
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
