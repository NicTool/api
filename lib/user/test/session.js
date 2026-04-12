import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import User from '../index.js'
import Session from '../session.js'
import userCase from './user.json' with { type: 'json' }

const sessionUser = {
  ...userCase,
  id: userCase.id + 100,
  username: `${userCase.username}-session`,
  email: `session-${userCase.email}`,
}

before(async () => {
  await User.create(sessionUser)
})

after(async () => {
  await Session.delete({ uid: sessionUser.id })
  await User.destroy({ id: sessionUser.id })
  await User.mysql.disconnect()
})

describe('session', function () {
  let sessionId

  describe('create', () => {
    it('creates a login session', async () => {
      sessionId = await Session.create({
        nt_user_id: sessionUser.id,
        session: '3.0.0',
        last_access: parseInt(Date.now() / 1000, 10),
      })
      assert.ok(sessionId)
    })
  })

  describe('get', () => {
    it('finds a session by id', async () => {
      const s = await Session.get({ id: sessionId })
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
