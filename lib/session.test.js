import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import User from './user.js'
import Session from './session.js'
import userCase from './test/user.json' with { type: 'json' }

before(async () => {
  await User.create(userCase)
})

after(async () => {
  await User.mysql.disconnect()
})

describe('session', function () {
  // Session._mysql.debug(true)
  let sessionId

  describe('create', () => {
    it('creates a login session', async () => {
      sessionId = await Session.create({
        nt_user_id: userCase.id,
        session: '3.0.0',
        last_access: parseInt(Date.now() / 1000, 10),
      })
      assert.ok(sessionId)
    })
  })

  describe('get', () => {
    it('finds a session by id', async () => {
      const s = await Session.get({ id: sessionId })
      // console.log(s)
      assert.ok(s?.id)
    })

    it('finds a session by nt_user_session_id', async () => {
      const s = await Session.get({ nt_user_session_id: sessionId })
      assert.ok(s?.id)
    })

    it('finds a session by session', async () => {
      const s = await Session.get({ nt_user_session: '3.0.0' })
      assert.ok(s?.id)
    })
  })

  describe('delete', () => {
    it('deletes a session by ID', async () => {
      assert.ok(await Session.delete({ id: sessionId }))
    })

    it('does not find a deleted session', async () => {
      assert.equal(await Session.get({ id: sessionId }), undefined)
    })
  })
})
