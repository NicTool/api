import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import userCase from './test/user.json' with { type: 'json' }
import groupCase from './test/group.json' with { type: 'json' }
import permCase from './test/permission.json' with { type: 'json' }

import User from '../lib/user.js'
import Group from '../lib/group.js'
import Permission from '../lib/permission.js'

let server

before(async () => {
  await Group.create(groupCase)
  await User.create(userCase)
  await Permission.create(permCase)
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

  describe('with session, can retrieve private URIs', () => {
    let auth = { headers: { } }

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

    after(async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/session',
        headers: auth.headers,
      })
      // console.log(res.result)
      assert.equal(res.statusCode, 200)
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
})
