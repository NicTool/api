import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from './group.js'
import User from './user.js'
import Permission from './permission.js'

import groupTestCase from './test/group.json' with { type: 'json' }
import userTestCase from './test/user.json' with { type: 'json' }
import permTestCase from './test/permission.json' with { type: 'json' }

before(async () => {
  await Group.create(groupTestCase)
  await User.create(userTestCase)
})

after(async () => {
  await Permission.mysql.disconnect()
})

describe('permission', function () {
  it('creates a permission', async () => {
    assert.ok(await Permission.create(permTestCase))
  })

  it('get: by id', async () => {
    assert.deepEqual(
      await Permission.get({ id: permTestCase.id }),
      permTestCase,
    )
  })

  it('get: by user id', async () => {
    assert.deepEqual(
      await Permission.get({ uid: permTestCase.user.id }),
      permTestCase,
    )
  })

  it('get: by group id', async () => {
    assert.deepEqual(
      await Permission.get({ gid: permTestCase.group.id }),
      permTestCase,
    )
  })

  it('getGroup: gets group permissions', async () => {
    assert.deepEqual(
      await Permission.getGroup({ uid: permTestCase.user.id }),
      permTestCase,
    )
  })

  it('changes a permission', async () => {
    assert.ok(await Permission.put({ id: permTestCase.id, name: 'Changed' }))
    const perm = await Permission.get({ id: permTestCase.id })
    assert.deepEqual(perm.name, 'Changed')
    assert.ok(
      await Permission.put({ id: permTestCase.id, name: 'Test Permission' }),
    )
  })

  it('deletes a permission', async () => {
    assert.ok(await Permission.delete({ id: permTestCase.id }))
    let p = await Permission.get({ id: permTestCase.id, deleted: 1 })
    assert.equal(p?.deleted, true)
    await Permission.delete({ id: permTestCase.id, deleted: 0 }) // restore
    p = await Permission.get({ id: permTestCase.id })
    assert.equal(p.deleted, undefined)
  })

  it('destroys a permission', async () => {
    assert.ok(await Permission.destroy({ id: permTestCase.id }))
    const p = await Permission.get({ id: permTestCase.id })
    assert.equal(p, undefined)
  })
})
