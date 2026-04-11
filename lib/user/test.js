import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, it, after, before } from 'node:test'

import User from './index.js'
import Group from '../group/index.js'
import Mysql from '../mysql.js'

import userCase from '../test/user.json' with { type: 'json' }
import groupCase from '../test/group.json' with { type: 'json' }

before(async () => {
  await Group.create(groupCase)
})

after(async () => {
  User.mysql.disconnect()
})

function sanitize(u) {
  const r = JSON.parse(JSON.stringify(u))
  for (const f of ['password', 'pass_salt', 'permissions', 'inherit_group_permissions', 'deleted']) {
    delete r[f]
  }
  return r
}

function sanitizeActual(u) {
  const r = JSON.parse(JSON.stringify(u))
  for (const f of ['permissions', 'inherit_group_permissions', 'deleted']) {
    delete r[f]
  }
  return r
}

describe('user', function () {
  describe('POST', function () {
    it('creates a user', async () => {
      assert.ok(await User.create(userCase))
      let users = await User.get({ id: userCase.id })
      assert.deepEqual(sanitizeActual(users[0]), sanitize(userCase))
      assert.ok(users[0].permissions, 'user has permissions')
    })
  })

  describe('GET', function () {
    it('finds existing user by id', async () => {
      const u = await User.get({ id: userCase.id })
      assert.deepEqual(sanitizeActual(u[0]), sanitize(userCase))
      assert.ok(u[0].permissions, 'user has permissions')
    })

    it('finds existing user by username', async () => {
      const u = await User.get({ username: 'unit-test' })
      assert.deepEqual(sanitizeActual(u[0]), sanitize(userCase))
    })
  })

  describe('PUT', function () {
    it('modifies existing user', async () => {
      assert.ok(await User.put({ id: userCase.id, first_name: 'Untie' }))
      let users = await User.get({ id: userCase.id })
      assert.equal(users[0].first_name, 'Untie')
      await User.put({ id: userCase.id, first_name: 'Unit' })
    })
  })

  describe('DELETE', function () {
    it('deletes a user', async () => {
      assert.ok(await User.delete({ id: userCase.id }))
      let u = await User.get({ id: userCase.id, deleted: true })
      assert.equal(u[0].deleted, true)
      await User.delete({ id: userCase.id, deleted: false }) // restore
      u = await User.get({ id: userCase.id })
      assert.equal(u[0].deleted, undefined)
    })
  })

  describe('validPassword', function () {
    it('auths user with plain text password', async () => {
      const r = await User.validPassword('test', 'test', 'demo', '')
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('auths valid self-describing PBKDF2 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await User.hashForStorage('YouGuessedIt!', salt)
      const r = await User.validPassword('YouGuessedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: true, needsUpgrade: false })
    })

    it('rejects invalid self-describing PBKDF2 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await User.hashForStorage('YouGuessedIt!', salt)
      const r = await User.validPassword('YouMissedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: false, needsUpgrade: false })
    })

    it('auths valid legacy PBKDF2-5000 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await User.hashAuthPbkdf2('YouGuessedIt!', salt, 5000)
      const r = await User.validPassword('YouGuessedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('rejects invalid legacy PBKDF2-5000 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await User.hashAuthPbkdf2('YouGuessedIt!', salt, 5000)
      const r = await User.validPassword('YouMissedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: false, needsUpgrade: false })
    })

    it('auths valid SHA1 password', async () => {
      const r = await User.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba70c938c60d80be60027',
        'unit-test',
      )
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('rejects invalid SHA1 password', async () => {
      const r = await User.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba7Oc938c60d80be60027',
        'unit-test',
      )
      assert.deepEqual(r, { valid: false, needsUpgrade: false })
    })
  })

  describe('authenticate', () => {
    it('rejects invalid user', async () => {
      const u = await User.authenticate({
        username: 'fake-test@example.com',
        password: 'evilCrackerJack',
      })
      assert.equal(u, undefined)
    })

    it('rejects invalid pass', async () => {
      const u = await User.authenticate({
        username: 'unit-test@example.com',
        password: 'evilCrackerJack',
      })
      assert.equal(u, undefined)
    })

    it('accepts a valid username & password', async () => {
      const u = await User.authenticate({
        username: `${userCase.username}@${groupCase.name}`,
        password: userCase.password,
      })
      assert.ok(u)
    })
  })

  describe('password upgrade on login', () => {
    const upgradeUserId = 4200
    const upgradeUser = {
      nt_user_id: upgradeUserId,
      nt_group_id: groupCase.id,
      username: 'upgrade-test',
      email: 'upgrade-test@example.com',
      first_name: 'Upgrade',
      last_name: 'Test',
    }
    const testPass = 'UpgradeMe!123'
    const authCreds = {
      username: `${upgradeUser.username}@${groupCase.name}`,
      password: testPass,
    }

    async function getDbPassword() {
      const rows = await Mysql.execute(
        'SELECT password, pass_salt FROM nt_user WHERE nt_user_id = ?',
        [upgradeUserId],
      )
      return rows[0]
    }

    // Raw SQL so we can insert specific legacy password formats (plain text,
    // SHA-1, PBKDF2-5000) that User.create() would hash on the way in.
    async function insertUser(password, passSalt) {
      await Mysql.execute(
        'INSERT INTO nt_user (nt_user_id, nt_group_id, username, email, first_name, last_name, password, pass_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [upgradeUserId, upgradeUser.nt_group_id, upgradeUser.username, upgradeUser.email, upgradeUser.first_name, upgradeUser.last_name, password, passSalt],
      )
    }

    async function cleanup() {
      await Mysql.execute(
        'DELETE FROM nt_user WHERE nt_user_id = ?',
        [upgradeUserId],
      )
    }

    before(cleanup)
    after(cleanup)

    it('upgrades plain text password to self-describing PBKDF2 on login', async () => {
      await cleanup()
      await insertUser(testPass, null)

      const result = await User.authenticate(authCreds)
      assert.ok(result, 'login should succeed')

      const row = await getDbPassword()
      assert.ok(row.pass_salt, 'pass_salt should be set after upgrade')
      assert.notEqual(row.password, testPass, 'password should be hashed')
      assert.ok(row.password.includes('$'), 'password should be in self-describing format')

      // verify round-trip: can still log in with the upgraded hash
      const again = await User.authenticate(authCreds)
      assert.ok(again, 'login should succeed after upgrade')
      await cleanup()
    })

    it('upgrades SHA1 password to self-describing PBKDF2 on login', async () => {
      // authenticate() passes the full authTry.username (including @group) to
      // validPassword(), so the HMAC key must match that full string
      const sha1Hash = crypto
        .createHmac('sha1', authCreds.username.toLowerCase())
        .update(testPass)
        .digest('hex')
      await cleanup()
      await insertUser(sha1Hash, null)

      const result = await User.authenticate(authCreds)
      assert.ok(result, 'login should succeed with SHA1 hash')

      const row = await getDbPassword()
      assert.ok(row.pass_salt, 'pass_salt should be set after upgrade')
      assert.notEqual(row.password, sha1Hash, 'password should be re-hashed')
      assert.ok(row.password.includes('$'), 'password should be in self-describing format')

      const again = await User.authenticate(authCreds)
      assert.ok(again, 'login should succeed after upgrade')
      await cleanup()
    })

    it('upgrades PBKDF2-5000 to self-describing format on login', async () => {
      const legacySalt = User.generateSalt()
      const legacyHash = await User.hashAuthPbkdf2(testPass, legacySalt, 5000)
      await cleanup()
      await insertUser(legacyHash, legacySalt)

      const result = await User.authenticate(authCreds)
      assert.ok(result, 'login should succeed with legacy PBKDF2')

      const row = await getDbPassword()
      assert.notEqual(row.password, legacyHash, 'password should be re-hashed')
      assert.notEqual(row.pass_salt, legacySalt, 'salt should be regenerated')
      assert.ok(row.password.includes('$'), 'password should be in self-describing format')

      const again = await User.authenticate(authCreds)
      assert.ok(again, 'login should succeed after upgrade')
      await cleanup()
    })

    it('does not re-hash password already in self-describing format', async () => {
      const salt = User.generateSalt()
      const hash = await User.hashForStorage(testPass, salt)
      await cleanup()
      await insertUser(hash, salt)

      await User.authenticate(authCreds)

      const row = await getDbPassword()
      assert.equal(row.password, hash, 'password should be unchanged')
      assert.equal(row.pass_salt, salt, 'salt should be unchanged')
      await cleanup()
    })
  })
})
