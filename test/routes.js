const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const { init } = require('../routes')
const userCase = require('./fixtures/user.json')

before(async () => {
  this.server = await init()
})

after(async () => {
  await this.server.stop()
})

describe('routes', () => {
  describe('GET /login', () => {
    it('responds with 200', async () => {
      const res = await this.server.inject({
        method: 'GET',
        url: '/login',
      })
      assert.deepEqual(res.statusCode, 200)
    })
  })

  describe('POST /login', () => {
    it('responds with 302', async () => {
      const res = await this.server.inject({
        method: 'POST',
        url: '/login',
        payload: {
          username: `${userCase.username}@example.com`,
          password: 'Wh@tA-Decent#P6ssw0rd',
        },
      })
      // console.log(res.result)
      assert.deepEqual(res.statusCode, 302)
    })
  })
})
