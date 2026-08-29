import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/zone.json' with { type: 'json' }

let server
let case2Id

const subGroup = { id: 4090, parent_gid: groupCase.id, name: 'sub.route.example.com' }
const subZone = { ...nsCase, id: 4091, gid: subGroup.id, zone: 'sub.route.example.com.' }

before(async () => {
  await Zone.destroy({ id: nsCase.id })
  await Zone.destroy({ id: subZone.id })
  // Destroy the subgroup before recreating it: a lingering row would make
  // Group.create early-return and skip addToSubgroups, leaving the
  // nt_group_subgroups closure row (and thus the include_subgroups query) empty.
  await Group.destroy({ id: subGroup.id })
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
  await Zone.create(nsCase, { ifExists: 'return' })
  await Group.create(subGroup)
  await Zone.create(subZone)
  server = await init()
})

after(async () => {
  if (case2Id) await Zone.destroy({ id: case2Id })
  await Zone.destroy({ id: subZone.id })
  await Group.destroy({ id: subGroup.id })
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

  it('POST /zone allocates an id', async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    delete testCase.id
    testCase.gid = groupCase.id
    testCase.zone = 'route2.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: auth.headers,
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.zone.length, 1)
    assert.equal(res.result.zone[0].zone, 'route2.example.com.')
    assert.ok(res.result.zone[0].gid)
    case2Id = res.result.zone[0].id
    assert.ok(Number.isInteger(case2Id))
  })

  it('PUT /zone/{id} keeps using the route id', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
      payload: { description: 'updated' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone[0].description, 'updated')
  })

  it('GET /zone/{id}', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.zone[0].gid)
  })

  it('DELETE /zone/{id}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /zone/{id} returns 404 when already deleted', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 404)
  })

  it('GET /zone/{id} hides a soft-deleted zone', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.zone, [])
  })

  it('GET /zone/{id}?deleted=true returns a soft-deleted zone', async () => {
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
