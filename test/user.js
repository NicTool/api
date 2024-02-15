const assert = require('node:assert/strict')
const { describe, it, before, after } = require('node:test')

const session = require('../lib/session')
const user = require('../lib/user')

const userCase = require('./fixtures/user.json')

before(async () => {
  this.sessionId = await session.create({
    nt_user_id: userCase.nt_user_id,
    nt_user_session: 12345,
  })

  let users = await user.read({ nt_user_id: userCase.nt_user_id })
  if (users.length === 1) return

  const instance = JSON.parse(JSON.stringify(userCase))
  instance.password = 'Wh@tA-Decent#P6ssw0rd'

  await user.create(instance)
})

after(async () => {
  // user._mysql.disconnect()
  session._mysql.disconnect()
})

describe('user', function () {
  describe('read', function () {
    it('finds existing user by nt_user_id', async function () {
      const u = await user.read({ nt_user_id: 4096 })
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

    it('finds existing user by username', async function () {
      const u = await user.read({ username: 'unit-test' })
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
  })

  describe('get_perms', function () {
    it('gets user permissions', async () => {
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
    it.todo('rejects invalid user', () => {})

    it.todo('rejects invalid pass', () => {})

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

  describe('create', () => {
    it('creates a login session', async () => {
      const s = await session.create({
        nt_user_id: userCase.nt_user_id,
        nt_user_session: 12345,
      })
      assert.ok(s)
    })
  })

  describe('read', function () {
    it('finds a session by ID', async () => {
      const s = await session.read({ id: this.sessionId })
      assert.ok(s)
    })

    it('finds a session by session', async () => {
      const s = await session.read({ nt_user_session: 12345 })
      assert.ok(s)
    })
  })
})
