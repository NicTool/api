const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const { init } = require('./index')
const User = require('../lib/user')
const userCase = require('../test/v3/user.json')

before(async () => {
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
  this.sessionCookie = parseCookie(res.headers['set-cookie'][0])
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

const parseCookie = (c) => {
  return c.split(';')[0]
}

describe('user', () => {
  it('GET /user', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/user',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('GET /user/4096', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/user/4096',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('POST /user', async () => {
    const testCase = JSON.parse(JSON.stringify(userCase))
    testCase.id = 4095 // make it unique
    testCase.username = `${testCase.username}2`
    delete testCase.deleted

    const res = await this.server.inject({
      method: 'POST',
      url: '/user',
      headers: {
        Cookie: this.sessionCookie,
      },
      payload: testCase,
    })
    console.log(res.result)
  })

  it('GET /user', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/user/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('DELETE /user', async () => {
    const res = await this.server.inject({
      method: 'DELETE',
      url: '/user/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('GET /user/4095', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/user/4095',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 204)
  })

  it('GET /user/4095 (deleted)', async () => {
    const res = await this.server.inject({
      method: 'GET',
      url: '/user/4095?deleted=1',
      headers: {
        Cookie: this.sessionCookie,
      },
    })
    // console.log(res.result)
    assert.equal(res.statusCode, 200)
  })

  it('nukes /user/4095', async () => {
    assert.ok(User.destroy({ id: 4095 }))
  })
})
