import assert from 'node:assert/strict'
import { describe, it, before, after, mock } from 'node:test'

import { init } from './index.js'
import userCase from './test/user.json' with { type: 'json' }
import groupCase from './test/group.json' with { type: 'json' }
import permCase from './test/permission.json' with { type: 'json' }

import User from '../lib/user/index.js'
import Group from '../lib/group/index.js'
import Permission from '../lib/permission/index.js'
import Session from '../lib/session/index.js'

let server

before(async () => {
  await Group.create(groupCase, { ifExists: 'return' })
  await User.create(userCase, { ifExists: 'return' })
  await Permission.create(permCase, { ifExists: 'return' })
  server = await init()
})

after(async () => {
  await server.stop()
})

describe('session routes', () => {
  const routes = [{ GET: '/' }, { DELETE: '/session' }]

  describe('no session responds with 401', () => {
    for (const r of routes) {
      const key = Object.keys(r)[0]
      const val = Object.values(r)[0]
      it(`${key} ${val}`, async () => {
        const res = await server.inject({
          method: key,
          url: val,
        })
        assert.deepEqual(res.statusCode, 401)
        // console.log(res.result)
      })
    }
  })

  const login = {
    username: `${userCase.username}@${groupCase.name}`,
    password: userCase.password,
  }

  it('POST /session refuses a wrong password', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/session',
      payload: { ...login, password: 'wrong' },
    })
    assert.equal(res.statusCode, 401)
  })

  it('logs in and refreshes activity when session writes fail', async () => {
    mock.method(console, 'error', () => {})
    mock.method(Session, 'expire', async () => {
      throw new Error('expire failed')
    })
    mock.method(Session, 'put', async () => {
      throw new Error('put failed')
    })
    try {
      const res = await server.inject({ method: 'POST', url: '/session', payload: login })
      assert.equal(res.statusCode, 200)
      const headers = { Authorization: `Bearer ${res.result.session.token}` }
      assert.equal((await server.inject({ method: 'GET', url: '/session', headers })).statusCode, 200)
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(console.error.mock.callCount(), 2)
      await server.inject({ method: 'DELETE', url: '/session', headers })
    } finally {
      mock.restoreAll()
    }
  })

  describe('invalid payload responds with 400', () => {
    const env = process.env.NODE_ENV

    after(() => {
      if (env === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = env
    })

    it('in production, with a generic message', async () => {
      process.env.NODE_ENV = 'production'
      const res = await server.inject({ method: 'POST', url: '/session', payload: {} })
      assert.equal(res.statusCode, 400)
      assert.equal(res.result.message, 'Invalid request payload input')
    })

    it('in development, with the validation details', async () => {
      process.env.NODE_ENV = 'development'
      const res = await server.inject({ method: 'POST', url: '/session', payload: {} })
      assert.equal(res.statusCode, 400)
      assert.match(res.result.message, /username/)
    })
  })

  describe('with session, can retrieve private URIs', () => {
    let auth = { headers: {} }

    before(async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/session',
        payload: {
          username: `${userCase.username}@${groupCase.name}`,
          password: userCase.password,
        },
      })
      assert.equal(res.statusCode, 200)
      assert.ok(res.result.user.id)
      auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
    })

    const routes = [{ GET: '/' }, { GET: '/session' }, { DELETE: '/session' }]

    for (const r of routes) {
      const key = Object.keys(r)[0]
      const val = Object.values(r)[0]
      it(`${key} ${val}`, async () => {
        const res = await server.inject({
          method: key,
          url: val,
          headers: auth.headers,
        })
        assert.equal(res.request.auth.isAuthenticated, true)
        assert.equal(res.statusCode, 200)
      })
    }
  })

  it('DELETE /session revokes the token', async () => {
    const res = await server.inject({ method: 'POST', url: '/session', payload: login })
    const headers = { Authorization: `Bearer ${res.result.session.token}` }

    assert.equal((await server.inject({ method: 'DELETE', url: '/session', headers })).statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: '/session', headers })).statusCode, 401)
  })

  it('refuses a token whose session row is gone', async () => {
    const res = await server.inject({ method: 'POST', url: '/session', payload: login })
    const headers = { Authorization: `Bearer ${res.result.session.token}` }

    await Session.delete({ id: res.result.session.id })
    assert.equal((await server.inject({ method: 'GET', url: '/user/4096', headers })).statusCode, 401)
  })

  it('counts any authenticated request as session activity', async () => {
    const res = await server.inject({ method: 'POST', url: '/session', payload: login })
    const { id, token } = res.result.session
    const headers = { Authorization: `Bearer ${token}` }
    const loggedIn = (await Session.get({ id })).last_access

    const now = Date.now()
    mock.method(Date, 'now', () => now + 120_000)
    try {
      assert.equal((await server.inject({ method: 'GET', url: '/', headers })).statusCode, 200)
    } finally {
      mock.restoreAll()
    }
    assert.ok((await Session.get({ id })).last_access >= loggedIn + 120)

    await server.inject({ method: 'DELETE', url: '/session', headers })
  })
})
