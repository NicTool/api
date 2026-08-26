import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import User from '../lib/user/index.js'
import Group from '../lib/group/index.js'
import Permission from '../lib/permission/index.js'
import Session from '../lib/session/index.js'
import Authz from '../lib/authz/index.js'

import groupCase from './test/group.json' with { type: 'json' }
import { grantGroupPermissions } from './test/permissions.js'
import userCase from './test/user.json' with { type: 'json' }

let server,
  auth = { headers: {} },
  sessionId

before(async () => {
  server = await init()
  await Group.create(groupCase)
  await Group.create(moveGroup)
  await User.create(userCase)
  await grantGroupPermissions(groupCase.id)
})

const userId2 = 4094
const moveGroup = { id: 4090, parent_gid: groupCase.id, name: 'user-move.route.example.com' }

after(async () => {
  User.destroy({ id: userId2 })
  await Group.destroy({ id: moveGroup.id })
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
    sessionId = res.result.session.id
    auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
  })

  it('authenticated requests refresh session activity', async (t) => {
    const sessionBefore = await Session.get({ id: sessionId })
    const now = sessionBefore.last_access + 7200
    t.mock.method(Date, 'now', () => now * 1000)

    const res = await server.inject({
      method: 'GET',
      url: '/user',
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)

    // the plugin's activity touch is fire-and-forget; give it a beat
    let lastAccess = sessionBefore.last_access
    for (let i = 0; i < 20 && lastAccess <= sessionBefore.last_access; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      const session = await Session.get({ id: sessionId })
      lastAccess = session?.last_access ?? sessionBefore.last_access
    }
    assert.equal(lastAccess, now)
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

  it('POST /user', async () => {
    const testCase = JSON.parse(JSON.stringify(userCase))
    testCase.id = userId2 // make it unique
    testCase.username = `${testCase.username}2`
    testCase.inherit_group_permissions = false
    delete testCase.deleted

    const res = await server.inject({
      method: 'POST',
      url: '/user',
      headers: auth.headers,
      payload: testCase,
    })
    assert.equal(res.statusCode, 201)
  })

  it('GET /user searches and paginates', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user?gid=${userCase.gid}&search=${userCase.username}2&exact_match=true&limit=10&offset=0&sort_by=username&sort_dir=desc`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(
      res.result.user.map((u) => u.username),
      [`${userCase.username}2`],
    )
    assert.equal(res.result.meta.pagination.filtered, 1)
    assert.equal(res.result.meta.pagination.limit, 10)
    assert.equal(res.result.meta.pagination.offset, 0)
  })

  it(`PUT /user/${userId2} moves it to another group`, async () => {
    const moved = await server.inject({
      method: 'PUT',
      url: `/user/${userId2}`,
      headers: auth.headers,
      payload: { gid: moveGroup.id },
    })
    assert.equal(moved.statusCode, 200)
    assert.equal((await User.get({ id: userId2 }))[0].gid, moveGroup.id)
    const movedPermission = await Permission.get({ uid: userId2 })
    assert.equal(movedPermission.group.id, moveGroup.id)
    assert.equal((await Authz.permissionRecord(movedPermission.id)).target_gid, moveGroup.id)

    const listed = await server.inject({
      method: 'GET',
      url: `/user?gid=${groupCase.id}&include_subgroups=true`,
      headers: auth.headers,
    })
    assert.equal(listed.statusCode, 200)
    assert.ok(listed.result.user.some((u) => u.id === userId2))
    assert.equal(listed.result.meta.pagination.total, listed.result.user.length)

    const sorted = await server.inject({
      method: 'GET',
      url: `/user?gid=${groupCase.id}&include_subgroups=true&sort_by=group_name&sort_dir=asc`,
      headers: auth.headers,
    })
    assert.equal(sorted.statusCode, 200)
    assert.equal(sorted.result.user.find((u) => u.id === userId2).group_name, moveGroup.name)

    const restored = await server.inject({
      method: 'PUT',
      url: `/user/${userId2}`,
      headers: auth.headers,
      payload: { gid: groupCase.id },
    })
    assert.equal(restored.statusCode, 200)
    assert.equal((await User.get({ id: userId2 }))[0].gid, groupCase.id)
    const restoredPermission = await Permission.get({ uid: userId2 })
    assert.equal(restoredPermission.group.id, groupCase.id)
    assert.equal((await Authz.permissionRecord(restoredPermission.id)).target_gid, groupCase.id)
  })

  it(`PUT /user/${userId2} rejects unknown permission controls`, async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${userId2}`,
      headers: auth.headers,
      payload: { definitely_not_a_permission: true },
    })
    assert.equal(res.statusCode, 400)
  })

  it(`GET /user/${userId2}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /user/${userId2}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it(`GET /user/${userId2} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}`,
      headers: auth.headers,
    })
    assert.ok([200, 204].includes(res.statusCode))
  })

  it(`GET /user/${userId2}?deleted=true`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/user/${userId2}?deleted=true`,
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
