const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const { init } = require('./index')
const userCase = require('../test/v3/user.json')

before(async () => {
  this.server = await init()
})

after(async () => {
  await this.server.stop()
})

const parseCookie = (c) => {
  return c.split(';')[0]
}

describe('routes', () => {
  const routes = [{ GET: '/' }, { GET: '/user' }, { DELETE: '/session' }]

  describe('no session responds with 401', () => {
    for (const r of routes) {
      const key = Object.keys(r)[0]
      const val = Object.values(r)[0]
      it(`${key} ${val}`, async () => {
        const res = await this.server.inject({
          method: key,
          url: val,
        })
        assert.deepEqual(res.statusCode, 401)
        // console.log(res.result)
      })
    }
  })

  describe('valid auth sets a cookie', () => {
    it('POST /session', async () => {
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
      // console.log(res.result)
    })
  })

  describe('with session, can retrieve private URIs', () => {
    before(async () => {
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
    })

    const routes = [
      { GET: '/' },
      { GET: '/user' },
      { GET: '/session' },
      { DELETE: '/session' },
    ]

    for (const r of routes) {
      const key = Object.keys(r)[0]
      const val = Object.values(r)[0]
      it(`${key} ${val}`, async () => {
        const res = await this.server.inject({
          method: key,
          url: val,
          headers: {
            Cookie: this.sessionCookie,
          },
        })
        assert.equal(res.request.auth.isAuthenticated, true)
        assert.equal(res.statusCode, 200)
        // console.log(res.result)
      })
    }
  })
})
