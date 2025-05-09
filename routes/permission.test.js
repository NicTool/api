import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'
import Permission from '../lib/permission.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import permCase from './test/permission.json' with { type: 'json' }

let server
let case2Id = 4094

before(async () => {
  server = await init()
  await Group.create(groupCase)
  await User.create(userCase)
  await Permission.create(permCase)
})

after(async () => {
  Permission.destroy({ id: case2Id })
  await server.stop()
})

describe('permission routes', () => {
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
    assert.ok(res.result.user.id)
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it(`GET /permission/${userCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${userCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.permission.zone.create, true)
    assert.equal(res.result.permission.nameserver.create, false)
  })

  it(`POST /permission (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(permCase))
    testCase.id = case2Id // make it unique
    testCase.user.id = case2Id
    testCase.group.id = case2Id
    testCase.name = `Route Test Permission 2`
    delete testCase.deleted
    // console.log(testCase)

    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: auth.headers,
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.permission.zone.create, true)
    assert.equal(res.result.permission.nameserver.create, false)
  })

  it(`GET /permission/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.permission.zone.create, true)
    assert.equal(res.result.permission.nameserver.create, false)
  })

  it(`DELETE /permission/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /permission/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 404)
  })

  it(`GET /permission/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.equal(res.result.permission, undefined)
  })

  it(`GET /permission/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${case2Id}?deleted=true`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.permission)
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
