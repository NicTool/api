const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const { init } = require('./index')
const userCase = require('../test/user.json')

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
})
