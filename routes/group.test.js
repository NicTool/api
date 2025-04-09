import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }

let server
const case2Id = 4094

before(async () => {
  server = await init()
  await Group.create(groupCase)
  await User.create(userCase)
})

after(async () => {
  await Group.destroy({ id: case2Id })
  server.stop()
})

describe('group routes', () => {
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
    assert.ok([200, 204].includes(res.statusCode))
  })

  it('POST /group', async () => {
    const testCase = JSON.parse(JSON.stringify(groupCase))
    testCase.id = case2Id // make it unique
    testCase.name = `example2.com`
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
  })

  it(`GET /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.ok([200, 204].includes(res.statusCode))
  })

  it(`DELETE /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it(`GET /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 204)
  })

  it(`GET /group/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}?deleted=true`,
      headers: auth.headers,
    })
    assert.ok([200, 204].includes(res.statusCode))
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
