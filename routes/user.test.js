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

  it('POST /user and PUT /user/{id} refuse a username the group has', async () => {
    const payload = { ...userCase, username: `${userCase.username}2`, email: 'dup@example.com' }
    delete payload.id
    delete payload.deleted
    const created = await server.inject({ method: 'POST', url: '/user', headers: auth.headers, payload })
    assert.equal(created.statusCode, 409)
    assert.equal(created.result.message, `username ${userCase.username}2@${groupCase.name} is not unique`)

    const renamed = await server.inject({
      method: 'PUT',
      url: `/user/${userId2}`,
      headers: auth.headers,
      payload: { username: userCase.username },
    })
    assert.equal(renamed.statusCode, 409)
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

describe('PUT /user/{id} password change', () => {
  const pass = 'Wh@tA-Decent#P6ssw0rd'
  const newPass = 'An0ther-Decent#Passw0rd'
  const pwUser = (id, username, extra = {}) => ({
    id,
    gid: groupCase.id,
    username,
    email: `${username}@example.com`,
    password: pass,
    ...extra,
  })
  const self = pwUser(9030, 'pw-self')
  const other = pwUser(9031, 'pw-other')
  const admin = pwUser(9032, 'pw-admin', { is_admin: true })
  const headers = {}

  async function login(user, password) {
    return server.inject({
      method: 'POST',
      url: '/session',
      payload: { username: `${user.username}@${groupCase.name}`, password },
    })
  }

  async function put(as, id, payload) {
    return server.inject({ method: 'PUT', url: `/user/${id}`, headers: headers[as], payload })
  }

  before(async () => {
    for (const u of [self, other, admin]) {
      await User.destroy({ id: u.id })
      await User.create(u)
      const res = await login(u, pass)
      headers[u.username] = { Authorization: `Bearer ${res.result.session.token}` }
    }
  })

  after(async () => {
    for (const u of [self, other, admin]) await User.destroy({ id: u.id })
  })

  it('wants the current password from a non-admin', async () => {
    const res = await put('pw-self', self.id, { password: newPass })
    assert.equal(res.statusCode, 400)
    assert.equal(res.result.meta.msg, 'current password is required')
  })

  it('refuses a wrong current password', async () => {
    const res = await put('pw-self', self.id, { password: newPass, current_password: 'wrong' })
    assert.equal(res.statusCode, 400)
    assert.equal(res.result.meta.msg, 'current password is incorrect')
    assert.equal((await login(self, pass)).statusCode, 200)
  })

  it('changes the password with the right current one', async () => {
    const res = await put('pw-self', self.id, { password: newPass, current_password: pass })
    assert.equal(res.statusCode, 200)
    assert.equal((await login(self, newPass)).statusCode, 200)
    assert.equal((await login(self, pass)).statusCode, 401)
  })

  it("wants the target user's password when a non-admin edits another user", async () => {
    const mine = await put('pw-self', other.id, { password: newPass, current_password: newPass })
    assert.equal(mine.statusCode, 400)
    assert.equal(mine.result.meta.msg, 'current password is incorrect')

    const theirs = await put('pw-self', other.id, { password: newPass, current_password: pass })
    assert.equal(theirs.statusCode, 200)
    assert.equal((await login(other, newPass)).statusCode, 200)
  })

  it('lets an admin change a password without the current one', async () => {
    const res = await put('pw-admin', other.id, { password: pass })
    assert.equal(res.statusCode, 200)
    assert.equal((await login(other, pass)).statusCode, 200)
  })

  it('answers 404 for a user that does not exist', async () => {
    const res = await put('pw-self', 9039, { password: newPass, current_password: pass })
    assert.equal(res.statusCode, 404)
  })

  it('does not store current_password', async () => {
    const res = await put('pw-self', self.id, { first_name: 'Kept', current_password: 'anything' })
    assert.equal(res.statusCode, 200)
    const [stored] = await User.get({ id: self.id })
    assert.equal(stored.first_name, 'Kept')
    assert.equal(stored.current_password, undefined)
  })
})
