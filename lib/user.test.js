import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import User from './user.js'
import Group from './group.js'

import testCase from './test/user.json' with { type: 'json' }
import groupCase from './test/group.json' with { type: 'json' }

before(async () => {
  await Group.create(groupCase)
})

after(async () => {
  User.mysql.disconnect()
})

function sanitize(u) {
  const r = JSON.parse(JSON.stringify(u))
  for (const f of ['deleted', 'password', 'pass_salt']) {
    delete r[f]
  }
  return r
}

describe('user', function () {
  describe('POST', function () {
    it('creates a user', async () => {
      assert.ok(await User.create(testCase))
      let users = await User.get({ id: testCase.id })
      assert.deepEqual(users[0], sanitize(testCase))
    })
  })

  describe('GET', function () {
    it('finds existing user by id', async () => {
      const u = await User.get({ id: testCase.id })
      // console.log(u)
      assert.deepEqual(u[0], sanitize(testCase))
    })

    it('finds existing user by username', async () => {
      const u = await User.get({ username: 'unit-test' })
      assert.deepEqual(u[0], sanitize(testCase))
    })
  })

  describe('PUT', function () {
    it('modifies existing user', async () => {
      assert.ok(await User.put({ id: testCase.id, first_name: 'Untie' }))
      let users = await User.get({ id: testCase.id })
      assert.equal(users[0].first_name, 'Untie')
      await User.put({ id: testCase.id, first_name: 'Unit' })
    })
  })

  describe('DELETE', function () {
    it('deletes a user', async () => {
      assert.ok(await User.delete({ id: testCase.id }))
      let u = await User.getAdmin({ id: testCase.id })
      assert.equal(u[0].deleted, 1)
      await User.delete({ id: testCase.id }, 0) // restore
      u = await User.getAdmin({ id: testCase.id })
      assert.equal(u[0].deleted, 0)
    })
  })

  describe('validPassword', function () {
    it('auths user with plain text password', async () => {
      const r = await User.validPassword('test', 'test', 'demo', '')
      assert.equal(r, true)
    })

    it('auths valid pbkdb2 password', async () => {
      const r = await User.validPassword(
        'YouGuessedIt!',
        '050cfa70c3582be0d5bfae25138a8486dc2e6790f39bc0c4e111223ba6034432',
        'unit-test',
        '(ICzAm2.QfCa6.MN',
      )
      assert.equal(r, true)
    })

    it('rejects invalid pbkdb2 password', async () => {
      const r = await User.validPassword(
        'YouMissedIt!',
        '050cfa70c3582be0d5bfae25138a8486dc2e6790f39bc0c4e111223ba6034432',
        'unit-test',
        '(ICzAm2.QfCa6.MN',
      )
      assert.equal(r, false)
    })

    it('auths valid SHA1 password', async () => {
      const r = await User.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba70c938c60d80be60027',
        'unit-test',
      )
      assert.equal(r, true)
    })

    it('rejects invalid SHA1 password', async () => {
      const r = await User.validPassword(
        'OhNoYouDont',
        '083007777a5241d01abba7Oc938c60d80be60027',
        'unit-test',
      )
      assert.equal(r, false)
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
        username: 'unit-test@example.com',
        password: 'Wh@tA-Decent#P6ssw0rd',
      })
      assert.ok(u)
    })
  })
})
