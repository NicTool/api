import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import User from '../lib/user.js'
import Group from '../lib/group.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }

let server, sessionCookie

before(async () => {
  server = await init()
  await Group.create(groupCase)
  await User.create(userCase)
})

const userId2 = 4094

after(async () => {
  User.destroy({ id: userId2 })
  await server.stop()
})

const parseCookie = (c) => {
  return c.split(';')[0]
}

describe('user routes', () => {
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
    sessionCookie = parseCookie(res.headers['set-cookie'][0])
  })

  it('GET /user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/user',
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`GET /user/${userCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userCase.id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('POST /user', async () => {
    const testCase = JSON.parse(JSON.stringify(userCase))
    testCase.id = userId2 // make it unique
    testCase.username = `${testCase.username}2`
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/user',
      headers: {
        Cookie: sessionCookie,
      },
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
  })

  it(`GET /user/${userId2}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /user/${userId2}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/user/${userId2}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`GET /user/${userId2}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 204)
  })

  it(`GET /user/${userId2}?deleted=1`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}?deleted=1`,
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
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })
})
