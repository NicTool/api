import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Nameserver from '../lib/nameserver/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/nameserver.json' with { type: 'json' }

let server
let case2Id

before(async () => {
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
  await Nameserver.create(nsCase, { ifExists: 'return' })
  server = await init()
})

after(async () => {
  if (case2Id) await Nameserver.destroy({ id: case2Id })
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

  it('POST /nameserver allocates an id', async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    delete testCase.id
    testCase.name = 'c.ns.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/nameserver',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.nameserver.length, 1)
    assert.equal(res.result.nameserver[0].name, 'c.ns.example.com.')
    assert.ok(res.result.nameserver[0].gid)
    case2Id = res.result.nameserver[0].id
    assert.ok(Number.isInteger(case2Id))
  })

  it('PUT /nameserver/{id} keeps using the route id', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
      payload: { description: 'updated' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver[0].description, 'updated')
  })

  it('GET /nameserver/{id}', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver[0].gid)
  })

  it('DELETE /nameserver/{id}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /nameserver/{id} returns 404 when already deleted', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 404)
  })

  it('GET /nameserver/{id} hides a soft-deleted nameserver', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: auth.headers,
    })
    assert.deepEqual(res.result.nameserver, [])
  })

  it('GET /nameserver/{id}?deleted=true returns a soft-deleted nameserver', async () => {
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
