import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import User from '../index.js'
import Group from '../../group/index.js'
import Credentials from '../credentials.js'

import userJson from './user.json' with { type: 'json' }
import groupJson from '../../group/test/group.json' with { type: 'json' }

// This suite soft-deletes and restores its user, so it uses private fixtures
// rather than the shared 4096 user/group that the concurrently-run permission
// and session suites depend on staying present.
const userCase = {
  ...userJson,
  id: 4085,
  gid: 4085,
  username: 'unit-test-lib',
  email: 'unit-test-lib@example.com',
}
const groupCase = { ...groupJson, id: 4085, name: 'usertest.example.com' }

before(async () => {
  await Group.create(groupCase, { ifExists: 'return' })
})

after(async () => {
  await User.destroy({ id: userCase.id })
  await Group.destroy({ id: groupCase.id })
  await User.disconnect()
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
      assert.ok(await User.create(userCase, { ifExists: 'return' }))
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
      const u = await User.get({ username: userCase.username })
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

    it('moves an explicit permission with its user', async () => {
      const target = { ...groupJson, id: 4084, name: 'usermove.example.com' }
      await Group.destroy({ id: target.id })
      await Group.create(target)
      try {
        await User.put({ id: userCase.id, inherit_group_permissions: false })
        assert.ok(await User.put({ id: userCase.id, gid: target.id }))
        const [u] = await User.get({ id: userCase.id })
        assert.equal(u.permissions.group.id, target.id)
      } finally {
        await User.put({ id: userCase.id, gid: groupCase.id, inherit_group_permissions: true })
        await Group.destroy({ id: target.id })
      }
    })
  })

  describe('username', function () {
    const twin = { ...groupJson, id: 4078, parent_gid: groupCase.id, name: groupCase.name }
    const other = { ...groupJson, id: 4077, parent_gid: groupCase.id, name: 'usertwin.example.com' }
    const peer = { ...userCase, id: 4079, username: 'unit-test-peer', email: 'peer@example.com' }
    const conflict = {
      code: 'STORE_CONFLICT',
      message: `username ${userCase.username}@${groupCase.name} is not unique`,
    }

    before(async () => {
      for (const g of [twin, other]) {
        await Group.destroy({ id: g.id })
        await Group.create(g)
      }
    })

    after(async () => {
      for (const id of [peer.id, 4076]) await User.destroy({ id })
      for (const g of [twin, other]) await Group.destroy({ id: g.id })
    })

    it('is unique among live groups of one name', async () => {
      await assert.rejects(User.create({ ...peer, username: userCase.username }), conflict)
      await assert.rejects(User.create({ ...peer, username: userCase.username, gid: twin.id }), conflict)
      assert.deepEqual(await User.get({ id: peer.id }), [])
      assert.ok(await User.create({ ...peer, username: userCase.username, gid: other.id }))
      await User.destroy({ id: peer.id })
    })

    it('is free in a deleted group', async () => {
      assert.ok(await User.create({ ...peer, gid: twin.id }))
      await Group.delete({ id: twin.id })
      try {
        await assert.rejects(User.create({ ...peer, id: 4075, gid: twin.id }), {
          code: 'STORE_CONFLICT',
          message: `username ${peer.username}@${groupCase.name} is not unique`,
        })
        assert.ok(await User.create({ ...peer, id: 4076 }))
        await assert.rejects(Group.delete({ id: twin.id, deleted: 0 }), {
          code: 'STORE_CONFLICT',
          message: `username ${peer.username}@${groupCase.name} is not unique`,
        })
        assert.equal((await Group.get({ id: twin.id, deleted: true })).length, 1)
      } finally {
        for (const id of [peer.id, 4075, 4076]) await User.destroy({ id })
        await Group.delete({ id: twin.id, deleted: 0 })
      }
    })

    it('in a deleted group meets the other groups on restore', async () => {
      await Group.delete({ id: twin.id })
      try {
        assert.ok(await User.create({ ...peer, username: userCase.username, gid: twin.id }))
        await assert.rejects(Group.delete({ id: twin.id, deleted: 0 }), conflict)
      } finally {
        await User.destroy({ id: peer.id })
        await Group.delete({ id: twin.id, deleted: 0 })
      }
    })

    it('needs a group that exists', async () => {
      await assert.rejects(User.create({ ...peer, gid: 4074 }), {
        code: 'STORE_INVALID',
        message: "group 4074 doesn't exist",
      })
      await assert.rejects(User.put({ id: userCase.id, gid: 4074 }), { code: 'STORE_INVALID' })
      await assert.rejects(User.create({ ...peer, gid: 4074, deleted: true }), { code: 'STORE_INVALID' })
      await assert.rejects(User.create({ ...peer, gid: undefined }), {
        code: 'STORE_INVALID',
        message: 'a user needs a gid',
      })
      assert.ok(await User.create({ ...peer, gid: other.id }))
      try {
        await assert.rejects(User.put({ id: peer.id, gid: 4074, deleted: true }), { code: 'STORE_INVALID' })
      } finally {
        await User.destroy({ id: peer.id })
      }
    })

    it('is checked when a group is created over users it left behind', async () => {
      const gone = { ...groupJson, id: 4073, parent_gid: groupCase.id, name: 'usergone.example.com' }
      await Group.destroy({ id: gone.id })
      await Group.create(gone)
      assert.ok(await User.create({ ...peer, username: userCase.username, gid: gone.id }))
      try {
        await Group.destroy({ id: gone.id })
        await assert.rejects(Group.create({ ...gone, name: groupCase.name }), conflict)
        assert.deepEqual(await Group.get({ id: gone.id }), [])
      } finally {
        await User.destroy({ id: peer.id })
        await Group.destroy({ id: gone.id })
      }
    })

    it('is checked when a group takes a name', async () => {
      assert.ok(await User.create({ ...peer, username: userCase.username, gid: other.id }))
      try {
        await assert.rejects(Group.put({ id: other.id, name: groupCase.name, usable_ns: ['3'] }), conflict)
        const [g] = await Group.get({ id: other.id })
        assert.equal(g.name, other.name)
        assert.deepEqual(g.permissions.nameserver.usable, [])
      } finally {
        await User.destroy({ id: peer.id })
      }
    })

    it('is checked on rename, move and restore', async () => {
      assert.ok(await User.create({ ...peer, gid: other.id }))
      await assert.rejects(User.put({ id: peer.id, username: userCase.username, gid: twin.id }), conflict)
      await assert.rejects(
        User.put({ id: peer.id, username: userCase.username, gid: groupCase.id }),
        conflict,
      )
      assert.ok(await User.put({ id: peer.id, username: userCase.username }))
      await assert.rejects(User.put({ id: peer.id, gid: twin.id }), conflict)
      assert.equal((await User.get({ id: peer.id }))[0].gid, other.id)

      assert.ok(await User.delete({ id: peer.id }))
      assert.ok(await User.create({ ...peer, id: 4076, username: userCase.username, gid: other.id }))
      await assert.rejects(User.delete({ id: peer.id, deleted: 0 }), {
        code: 'STORE_CONFLICT',
        message: `username ${userCase.username}@${other.name} is not unique`,
      })
      assert.equal((await User.get({ id: peer.id, deleted: true })).length, 1)
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
      const r = await Credentials.validPassword('test', 'test', 'demo', '')
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('auths valid self-describing PBKDF2 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await Credentials.hashForStorage('YouGuessedIt!', salt)
      const r = await Credentials.validPassword('YouGuessedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: true, needsUpgrade: false })
    })

    it('rejects invalid self-describing PBKDF2 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await Credentials.hashForStorage('YouGuessedIt!', salt)
      const r = await Credentials.validPassword('YouMissedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: false, needsUpgrade: false })
    })

    it('auths valid legacy PBKDF2-5000 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await Credentials.hashAuthPbkdf2('YouGuessedIt!', salt, 5000)
      const r = await Credentials.validPassword('YouGuessedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('rejects invalid legacy PBKDF2-5000 password', async () => {
      const salt = '(ICzAm2.QfCa6.MN'
      const hash = await Credentials.hashAuthPbkdf2('YouGuessedIt!', salt, 5000)
      const r = await Credentials.validPassword('YouMissedIt!', hash, 'unit-test', salt)
      assert.deepEqual(r, { valid: false, needsUpgrade: false })
    })

    it('auths valid SHA1 password', async () => {
      const r = await Credentials.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba70c938c60d80be60027',
        'unit-test',
      )
      assert.deepEqual(r, { valid: true, needsUpgrade: true })
    })

    it('rejects invalid SHA1 password', async () => {
      const r = await Credentials.validPassword(
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

    it('rejects a valid user in the wrong group', async () => {
      const u = await User.authenticate({
        username: `${userCase.username}@wrong.example.com`,
        password: userCase.password,
      })
      assert.equal(u, undefined)
    })

    it('rejects a valid user in a deleted group', async () => {
      await Group.delete({ id: groupCase.id })
      const u = await User.authenticate({
        username: `${userCase.username}@${groupCase.name}`,
        password: userCase.password,
      })
      await Group.delete({ id: groupCase.id, deleted: 0 })
      assert.equal(u, undefined)
    })
  })
})
