import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import User from './user.js'

const user = new User()

after(async () => {
  user.mysql.disconnect()
})

describe('user', function () {
  describe('GET', function () {
    it('finds existing user by id', async () => {
      const u = await user.get({ id: 4096 })
      // console.log(u)
      assert.deepEqual(u[0], {
        id: 4096,
        gid: 4096,
        username: 'unit-test',
        email: 'unit-test@example.com',
        first_name: 'Unit',
        last_name: 'Test',
        // deleted: 0,
      })
    })

    it('finds existing user by username', async () => {
      const u = await user.get({ username: 'unit-test' })
      // console.log(u)
      assert.deepEqual(u[0], {
        gid: 4096,
        id: 4096,
        username: 'unit-test',
        email: 'unit-test@example.com',
        first_name: 'Unit',
        last_name: 'Test',
        // deleted: 0,
      })
    })
  })

  describe('PUT', function () {
    it.todo('modifies existing user', async () => {
      assert.ok(await user.put({ id: 4096, first_name: 'Untie' }))
      let users = await user.get({ id: 4096 })
      assert.equal(users[0].first_name, 'Untie')
      await user.put({ id: 4096, first_name: 'Unit' })
    })
  })

  describe('DELETE', function () {
    it('deletes a user', async () => {
      assert.ok(await user.delete({ id: 4096 }))
      let u = await user.getAdmin({ id: 4096 })
      assert.equal(u[0].deleted, 1)
      await user.delete({ id: 4096 }, 0) // restore
      u = await user.getAdmin({ id: 4096 })
      assert.equal(u[0].deleted, 0)
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
