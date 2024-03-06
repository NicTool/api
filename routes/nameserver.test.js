import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group.js'
import User from '../lib/user.js'
import Nameserver from '../lib/nameserver.js'

import groupCase from './test/group.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import nsCase from './test/nameserver.json' with { type: 'json' }

let server
let case2Id = 4094

before(async () => {
  await Nameserver.destroy({ id: case2Id })
  await Group.create(groupCase)
  await User.create(userCase)
  await Nameserver.create(nsCase)
  server = await init()
})

after(async () => {
  await server.stop()
})

describe('nameserver routes', () => {
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

  it(`GET /nameserver/${nsCase.id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${nsCase.id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver.name, nsCase.name)
  })

  it(`POST /nameserver (${case2Id})`, async () => {
    const testCase = JSON.parse(JSON.stringify(nsCase))
    testCase.id = case2Id // make it unique
    testCase.gid = case2Id
    testCase.name = 'c.ns.example.com.'

    const res = await server.inject({
      method: 'POST',
      url: '/nameserver',
      headers: {
        Cookie: sessionCookie,
      },
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
    assert.ok(res.result.nameserver.gid)
  })

  it(`GET /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver.gid)
  })

  it(`DELETE /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/nameserver/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it(`GET /nameserver/${case2Id}`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    // assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver, undefined)
  })

  it(`GET /nameserver/${case2Id} (deleted)`, async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${case2Id}?deleted=true`,
      headers: {
        Cookie: sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver)
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
