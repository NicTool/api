import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, it, before, after } from 'node:test'

import User from '../index.js'
import Group from '../../group/index.js'
import Credentials from '../credentials.js'

import groupJson from '../../group/test/group.json' with { type: 'json' }

// Distinct ids so this never races with index.js, which runs concurrently
const groupCase = { ...groupJson, id: 9002, name: 'usertest-mysql.example.com' }
const upgradeUserId = 9002
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

const SELF_DESCRIBING = /^\d+\$[0-9a-f]{64}$/

before(async () => {
  await Group.create(groupCase, { ifExists: 'return' })
})

after(async () => {
  await User.destroy({ id: upgradeUserId })
  await Group.destroy({ id: groupCase.id })
  await User.disconnect()
})

async function storedCredentials() {
  const rows = await User.mysql.execute('SELECT password, pass_salt FROM nt_user WHERE nt_user_id = ?', [
    upgradeUserId,
  ])
  return rows[0]
}

// Raw SQL so we can plant the legacy password formats (plain text, SHA-1,
// PBKDF2-5000) that User.create() would hash on the way in.
async function seedUser(password, passSalt) {
  await User.destroy({ id: upgradeUserId })
  await User.mysql.execute(
    'INSERT INTO nt_user (nt_user_id, nt_group_id, username, email, first_name, last_name, password, pass_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      upgradeUserId,
      upgradeUser.nt_group_id,
      upgradeUser.username,
      upgradeUser.email,
      upgradeUser.first_name,
      upgradeUser.last_name,
      password,
      passSalt,
    ],
  )
}

describe('user (mysql)', function () {
  describe('password upgrade on login', function () {
    after(async () => {
      await User.destroy({ id: upgradeUserId })
    })

    it('upgrades plain text password to self-describing PBKDF2 on login', async () => {
      await seedUser(testPass, null)

      assert.ok(await User.authenticate(authCreds), 'login should succeed')

      const creds = await storedCredentials()
      assert.ok(creds.pass_salt, 'pass_salt should be set after upgrade')
      assert.match(creds.password, SELF_DESCRIBING)

      assert.ok(await User.authenticate(authCreds), 'login should succeed after upgrade')
    })

    it('upgrades SHA1 password to self-describing PBKDF2 on login', async () => {
      // authenticate() passes the full authTry.username (including @group) to
      // validPassword(), so the HMAC key must match that full string
      const sha1Hash = crypto
        .createHmac('sha1', authCreds.username.toLowerCase())
        .update(testPass)
        .digest('hex')
      await seedUser(sha1Hash, null)

      assert.ok(await User.authenticate(authCreds), 'login should succeed with SHA1 hash')

      const creds = await storedCredentials()
      assert.ok(creds.pass_salt, 'pass_salt should be set after upgrade')
      assert.match(creds.password, SELF_DESCRIBING)

      assert.ok(await User.authenticate(authCreds), 'login should succeed after upgrade')
    })

    it('upgrades PBKDF2-5000 to self-describing format on login', async () => {
      const legacySalt = Credentials.generateSalt()
      const legacyHash = await Credentials.hashAuthPbkdf2(testPass, legacySalt, 5000)
      await seedUser(legacyHash, legacySalt)

      assert.ok(await User.authenticate(authCreds), 'login should succeed with legacy PBKDF2')

      const creds = await storedCredentials()
      assert.match(creds.password, SELF_DESCRIBING)
      assert.notEqual(creds.pass_salt, legacySalt, 'salt should be regenerated')

      assert.ok(await User.authenticate(authCreds), 'login should succeed after upgrade')
    })

    it('does not re-hash password already in self-describing format', async () => {
      const salt = Credentials.generateSalt()
      const hash = await Credentials.hashForStorage(testPass, salt)
      await seedUser(hash, salt)

      await User.authenticate(authCreds)

      const creds = await storedCredentials()
      assert.equal(creds.password, hash, 'password should be unchanged')
      assert.equal(creds.pass_salt, salt, 'salt should be unchanged')
    })
  })
})
