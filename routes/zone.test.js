import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'
import Zone from '../lib/zone.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/zone.json' with { type: 'json' }

let server
let case2Id = 4094

before(async () => {
  await Zone.destroy({ id: case2Id })
  await Group.create(groupCase)
  await User.create(userCase)
  await Zone.create(nsCase)
  server = await init()
})

after(async () => {
  // await Zone.destroy({ id: case2Id })
  server.stop()
})

describe('zone routes', () => {
  let sessionCookie

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

  it(`GET /zone/${nsCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${nsCase.id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone.name, nsCase.name)
  })

  it(`POST /zone (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    testCase.id = case2Id // make it unique
    testCase.gid = case2Id
    testCase.zone = 'route2.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: {
        Cookie: sessionCookie,
      },
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
    assert.ok(res.result.zone.gid)
  })

  it(`GET /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.zone.gid)
  })

  it(`DELETE /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`DELETE /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 404)
  })

  it(`GET /zone/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone, undefined)
  })

  it(`GET /zone/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${case2Id}?deleted=true`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res?.result?.zone, undefined)
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
