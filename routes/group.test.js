import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }

let server, sessionCookie

before(async () => {
  server = await init()
  await Group.create(groupCase)
  await User.create(userCase)
})

after(async () => {
  await server.stop()
})

describe('group routes', () => {
  it('POST /session establishes a session', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/session',
      payload: {
        username: `${userCase.username}@${groupCase.name}`,
        password: userCase.password,
      },
    })
    assert.ok(res.headers['set-cookie'][0])
    sessionCookie = res.headers['set-cookie'][0].split(';')[0]
  })

  it(`GET /group/${groupCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${groupCase.id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  const case2Id = 4094

  it('POST /group', async () => {
    const testCase = JSON.parse(JSON.stringify(groupCase))
    testCase.id = case2Id // make it unique
    testCase.name = `example2.com`
    delete testCase.deleted
    // console.log(testCase)

    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: {
        Cookie: sessionCookie,
      },
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
  })

  it('GET /group', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/group/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`GET /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 204)
  })

  it(`GET /group/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/group/${case2Id}?deleted=1`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /group/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/group/${case2Id}?destroy=true`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /session', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/session',
      headers: {
        Cookie: sessionCookie,
      },
    })
    assert.equal(res.statusCode, 200)
  })
})
