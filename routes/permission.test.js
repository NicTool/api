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

  it('POST /permission cannot create your own permissions', async () => {
    const testCase = JSON.parse(JSON.stringify(permCase))

    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /own permissions/)
  })

  it(`PUT /permission/${userCase.id} cannot change your own permissions`, async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/permission/${userCase.id}`,
      headers: auth.headers,
      payload: permCase,
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /own permissions/)
  })

  it(`DELETE /permission/${userCase.id} cannot delete your own permissions`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/permission/${userCase.id}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /own permissions/)
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
