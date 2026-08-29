import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Permission from '../lib/permission/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import permCase from './test/permission.json' with { type: 'json' }

let server
let case2Id
const targetId = 63094

before(async () => {
  server = await init()
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
  await Permission.create(permCase, { ifExists: 'return' })
})

after(async () => {
  if (case2Id !== undefined) await Permission.destroy({ id: case2Id })
  await server.stop()
})

describe('permission routes', () => {
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

  it(`GET /permission/${permCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${permCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.permission.zone.create, true)
    assert.equal(res.result.permission.nameserver.create, false)
  })

  it('POST /permission', async () => {
    const testCase = JSON.parse(JSON.stringify(permCase))
    delete testCase.id
    testCase.user.id = targetId
    testCase.group.id = targetId
    testCase.name = `Route Test Permission 2`
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
    case2Id = res.result.permission.id
    assert.equal(res.result.permission.zone.create, true)
    assert.equal(res.result.permission.nameserver.create, false)
  })

  it('POST /permission rejects an existing target', async () => {
    const testCase = JSON.parse(JSON.stringify(permCase))
    delete testCase.id
    testCase.user.id = targetId
    testCase.group.id = targetId
    testCase.name = 'Changed Route Test Permission'
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 409)
    assert.match(res.result.message, /permission id .* already exists/)

    const existing = await Permission.get({ id: case2Id })
    assert.equal(existing.name, 'Route Test Permission 2')
  })

  it('GET the created permission', async () => {
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

  it('DELETE the created permission', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('DELETE the created permission again', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 404)
  })

  it('GET the deleted permission', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/permission/${case2Id}`,
      headers: auth.headers,
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.equal(res.result.permission, undefined)
  })

  it('GET the deleted permission with deleted=true', async () => {
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
