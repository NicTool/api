const assert = require('node:assert/strict')
const { describe, it, after } = require('node:test')

const session = require('../lib/session')
const user = require('../lib/user')

const userCase = require('./fixtures/user.json')

after(async () => {
  // user._mysql.disconnect()
  session._mysql.disconnect()
})

describe('user', function () {
  describe('get', function () {
    it('finds existing user by nt_user_id', async () => {
      const u = await user.get({ nt_user_id: 4096 })
      // console.log(u)
      assert.deepEqual(u[0], {
        nt_group_id: 4096,
        nt_user_id: 4096,
        username: 'unit-test',
        email: 'unit-test@example.com',
        first_name: 'Unit',
        last_name: 'Test',
        deleted: 0,
      })
    })

    it('finds existing user by username', async () => {
      const u = await user.get({ username: 'unit-test' })
      // console.log(u)
      assert.deepEqual(u[0], {
        nt_group_id: 4096,
        nt_user_id: 4096,
        username: 'unit-test',
        email: 'unit-test@example.com',
        first_name: 'Unit',
        last_name: 'Test',
        deleted: 0,
      })
    })

    it('deletes a user', async () => {
      await user.delete({ nt_user_id: 4096 })
      let u = await user.get({ nt_user_id: 4096 })
      assert.equal(u[0].deleted, 1)
      await user.delete({ nt_user_id: 4096 }, 0) // restore
      u = await user.get({ nt_user_id: 4096 })
      assert.equal(u[0].deleted, 0)
    })
  })

  describe('get_perms', function () {
    it.skip('gets user permissions', async () => {
      const p = await user.get_perms(242)
      assert.deepEqual(p[0], {
        group_create: 1,
        group_delete: 1,
        group_write: 1,
        nameserver_create: 0,
        nameserver_delete: 0,
        nameserver_write: 0,
        self_write: 1,
        usable_ns: null,
        user_create: 1,
        user_delete: 1,
        user_write: 1,
        zone_create: 1,
        zone_delegate: 1,
        zone_delete: 1,
        zone_write: 1,
        zonerecord_create: 1,
        zonerecord_delegate: 1,
        zonerecord_delete: 1,
        zonerecord_write: 1,
      })
    })
  })

  describe('validPassword', function () {
    it('auths user with plain text password', async () => {
      const r = await user.validPassword('test', 'test', 'demo', '')
      assert.equal(r, true)
    })

    it('auths valid pbkdb2 password', async () => {
      const r = await user.validPassword(
        'YouGuessedIt!',
        '050cfa70c3582be0d5bfae25138a8486dc2e6790f39bc0c4e111223ba6034432',
        'unit-test',
        '(ICzAm2.QfCa6.MN',
      )
      assert.equal(r, true)
    })

    it('rejects invalid pbkdb2 password', async () => {
      const r = await user.validPassword(
        'YouMissedIt!',
        '050cfa70c3582be0d5bfae25138a8486dc2e6790f39bc0c4e111223ba6034432',
        'unit-test',
        '(ICzAm2.QfCa6.MN',
      )
      assert.equal(r, false)
    })

    it('auths valid SHA1 password', async () => {
      const r = await user.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba70c938c60d80be60027',
        'unit-test',
      )
      assert.equal(r, true)
    })

    it('rejects invalid SHA1 password', async () => {
      const r = await user.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba7Oc938c60d80be60027',
        'unit-test',
      )
      assert.equal(r, false)
    })
  })

  describe('authenticate', () => {
    it('rejects invalid user', async () => {
      const u = await user.authenticate({
        username: 'fake-test@example.com',
        password: 'evilCrackerJack',
      })
      assert.equal(u, undefined)
    })

    it('rejects invalid pass', async () => {
      const u = await user.authenticate({
        username: 'unit-test@example.com',
        password: 'evilCrackerJack',
      })
      assert.equal(u, undefined)
    })

    it('accepts a valid username & password', async () => {
      const u = await user.authenticate({
        username: 'unit-test@example.com',
        password: 'Wh@tA-Decent#P6ssw0rd',
      })
      assert.ok(u)
    })
  })
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
      // console.log(s)
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
