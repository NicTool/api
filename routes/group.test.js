const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const { init } = require('./index')
const Group = require('../lib/group')
const groupCase = require('../test/v3/group.json')

before(async () => {
  const userCase = require('../test/v3/user.json')
  this.server = await init()
  const res = await this.server.inject({
    method: 'POST',
    url: '/session',
    payload: {
      username: `${userCase.username}@example.com`,
      password: 'Wh@tA-Decent#P6ssw0rd',
    },
  })
  assert.ok(res.headers['set-cookie'][0])
  this.sessionCookie = res.headers['set-cookie'][0].split(';')[0]
})

after(async () => {
  const res = await this.server.inject({
    method: 'DELETE',
    url: '/session',
    headers: {
      Cookie: this.sessionCookie,
    },
  })
  // console.log(res.result)
  assert.equal(res.statusCode, 200)

  await this.server.stop()
})

describe('group', () => {
  it('GET /group/4096', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/group/4096',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('POST /group', async () => {
    const testCase = JSON.parse(JSON.stringify(groupCase))
    testCase.id = 4095 // make it unique
    testCase.name = `example2.com`
    delete testCase.deleted
    // console.log(testCase)

    const res = await this.server.inject({
      method: 'POST',
      url: '/group',
      headers: {
        Cookie: this.sessionCookie,
      },
      payload: testCase,
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 201)
  })

  it('GET /group', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/group/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /group', async () => {
    const res = await this.server.inject({
      method: 'DELETE',
      url: '/group/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('GET /group/4095', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/group/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 204)
  })

  it('GET /group/4095 (deleted)', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/group/4095?deleted=1',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('nukes /group/4095', async () => {
    assert.ok(Group.destroy({ id: 4095 }))
  })
})
