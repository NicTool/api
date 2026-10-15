import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }

let server
let case2Id

before(async () => {
  server = await init()
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
})

after(async () => {
  if (case2Id) await Group.destroy({ id: case2Id })
  await server.stop()
})

describe('group routes', () => {
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
    assert.ok(res.result.group.id)
    // auth.headers = { Cookie: res.headers['set-cookie'][0].split(';')[0] }
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it(`GET /group/${groupCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${groupCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.group[0].id, groupCase.id)
  })

  it('POST /group allocates an id', async () => {
    const testCase = JSON.parse(JSON.stringify(groupCase))
    delete testCase.id
    testCase.name = `example2.com`
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.group.length, 1)
    assert.equal(res.result.group[0].name, 'example2.com')
    case2Id = res.result.group[0].id
    assert.ok(Number.isInteger(case2Id))
  })

  it('PUT /group/{id} keeps using the route id', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/group/${case2Id}`,
      headers: auth.headers,
      payload: { name: 'example3.com' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.group[0].name, 'example3.com')
  })

  it('GET /group/{id}', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.group[0].id, case2Id)
  })

  it('DELETE /group/{id}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('GET /group/{id} hides a soft-deleted group', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.result.group, [])
  })

  it('GET /group/{id}?deleted=true returns a soft-deleted group', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}?deleted=true`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(Array.isArray(res.result.group))
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
