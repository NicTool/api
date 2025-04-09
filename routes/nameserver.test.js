import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'
import Nameserver from '../lib/nameserver.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/nameserver.json' with { type: 'json' }

let server
let case2Id = 4094

before(async () => {
  await Nameserver.destroy({ id: case2Id })
  await Group.create(groupCase)
  await User.create(userCase)
  await Nameserver.create(nsCase)
  server = await init()
})

after(async () => {
  await Nameserver.destroy({ id: case2Id })
  server.stop()
})

describe('nameserver routes', () => {
  let auth = { headers: { } }

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

  it(`POST /nameserver (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    testCase.id = case2Id // make it unique
    testCase.gid = case2Id
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
