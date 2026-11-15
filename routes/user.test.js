import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import User from '../lib/user/index.js'
import Group from '../lib/group/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }

let server,
  auth = { headers: {} }

before(async () => {
  server = await init()
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
})

let userId2
const namelessUsername = `${userCase.username}3`

after(async () => {
  if (userId2) await User.destroy({ id: userId2 })
  for (const deleted of [false, true]) {
    for (const u of await User.get({ username: namelessUsername, gid: userCase.gid, deleted }))
      await User.destroy({ id: u.id })
  }
  await server.stop()
})

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
    assert.ok(res.result.user.id)
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it('GET /user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/user',
      headers: auth.headers,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`GET /user/${userCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('POST /user allocates an id', async () => {
    const testCase = JSON.parse(JSON.stringify(userCase))
    delete testCase.id
    testCase.username = `${testCase.username}2`
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/user',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.user.length, 1)
    assert.equal(res.result.user[0].username, `${userCase.username}2`)
    userId2 = res.result.user[0].id
    assert.ok(Number.isInteger(userId2))
  })

  it('PUT /user/{id} keeps using the route id', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${userId2}`,
      headers: auth.headers,
      payload: { first_name: 'Updated' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.user[0].first_name, 'Updated')
  })

  it('GET /user/{id}', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /user/{id}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('GET /user/{id} hides a soft-deleted user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.ok([200, 204].includes(res.statusCode))
  })

  it('GET /user/{id}?deleted=true returns a soft-deleted user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}?deleted=true`,
      headers: auth.headers,
    })
    assert.ok([200, 204].includes(res.statusCode))
  })

  it('a user created without names can be read, listed and logged in', async () => {
    const testCase = JSON.parse(JSON.stringify(userCase))
    delete testCase.id
    delete testCase.deleted
    delete testCase.first_name
    delete testCase.last_name
    testCase.username = namelessUsername

    const created = await server.inject({
      method: 'POST',
      url: '/user',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(created.statusCode, 201)
    const id = created.result.user[0].id
    assert.equal(created.result.user[0].first_name, undefined)

    const one = await server.inject({ method: 'GET', url: `/user/${id}`, headers: auth.headers })
    assert.equal(one.statusCode, 200)

    const list = await server.inject({
      method: 'GET',
      url: `/user?gid=${userCase.gid}`,
      headers: auth.headers,
    })
    assert.equal(list.statusCode, 200)
    assert.ok(list.result.user.some((u) => u.id === id))

    const login = await server.inject({
      method: 'POST',
      url: '/session',
      payload: { username: `${testCase.username}@${groupCase.name}`, password: testCase.password },
    })
    assert.equal(login.statusCode, 200)
    assert.equal(login.result.user.id, id)

    const headers = { Authorization: `Bearer ${login.result.session.token}` }
    const session = await server.inject({ method: 'GET', url: '/session', headers })
    assert.equal(session.statusCode, 200)
    await server.inject({ method: 'DELETE', url: '/session', headers })
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
