const assert = require('node:assert/strict')
const { describe, it, after } = require('node:test')

const session = require('./session')
const userCase = require('../test/v3/user.json')

after(async () => {
  session._mysql.disconnect()
})

describe('session', function () {
  // session._mysql.debug(true)
  let sessionId

  describe('create', () => {
    it('creates a login session', async () => {
      sessionId = await session.create({
        nt_user_id: userCase.nt_user_id,
        nt_user_session: '3.0.0',
      })
      assert.ok(sessionId)
    })
  })

  describe('get', () => {
    it('finds a session by ID', async () => {
      const s = await session.get({ nt_user_session_id: sessionId })
      assert.ok(s.nt_user_session_id)
    })

    it('finds a session by session', async () => {
      const s = await session.get({ nt_user_session: '3.0.0' })
      assert.ok(s.nt_user_session_id)
    })
  })

  describe('delete', () => {
    it('deletes a session by ID', async () => {
      assert.ok(await session.delete({ nt_user_session_id: sessionId }))
    })

    it('does not find a deleted session', async () => {
      assert.equal(
        await session.get({ nt_user_session_id: sessionId }),
        undefined,
      )
    })
  })
})
