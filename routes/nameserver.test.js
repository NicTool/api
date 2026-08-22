import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Nameserver from '../lib/nameserver/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import { grantGroupPermissions } from './test/permissions.js'
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/nameserver.json' with { type: 'json' }

let server
let case2Id = 4094
const moveGroup = { id: 4090, parent_gid: groupCase.id, name: 'ns-move.route.example.com' }

before(async () => {
  await Nameserver.destroy({ id: case2Id })
  await Group.create(groupCase)
  await Group.create(moveGroup)
  await User.create(userCase)
  await grantGroupPermissions(groupCase.id)
  await Nameserver.create(nsCase)
  server = await init()
})

after(async () => {
  await Nameserver.destroy({ id: case2Id })
  await Group.destroy({ id: moveGroup.id })
  await server.stop()
})

describe('nameserver routes', () => {
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
    assert.ok(res.result.session.token)
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it(`GET /nameserver/${nsCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${nsCase.id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver[0].name, nsCase.name)
  })

  it(`PUT /nameserver/${nsCase.id} moves it to another group`, async () => {
    const moved = await server.inject({
      method: 'PUT',
      url: `/nameserver/${nsCase.id}`,
      headers: auth.headers,
      payload: { gid: moveGroup.id },
    })
    assert.equal(moved.statusCode, 200)
    assert.equal(moved.result.nameserver[0].gid, moveGroup.id)

    const restored = await server.inject({
      method: 'PUT',
      url: `/nameserver/${nsCase.id}`,
      headers: auth.headers,
      payload: { gid: groupCase.id },
    })
    assert.equal(restored.statusCode, 200)
    assert.equal(restored.result.nameserver[0].gid, groupCase.id)
  })

  it(`POST /nameserver (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    testCase.id = case2Id // make it unique
    testCase.name = 'c.ns.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/nameserver',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
    assert.ok(res.result.nameserver[0].gid)
  })

  it(`GET /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver[0].gid)
  })

  it(`DELETE /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 404)
  })

  it(`GET /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.deepEqual(res.result.nameserver, [])
  })

  it(`GET /nameserver/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}?deleted=true`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver)
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
