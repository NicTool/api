import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from './group/index.js'
import User from './user/index.js'
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
    assert.deepEqual(await Permission.get({ id: permTestCase.id }), permTestCase)
  })

  it('get: by user id', async () => {
    assert.deepEqual(await Permission.get({ uid: permTestCase.user.id }), permTestCase)
  })

  it('get: by group id', async () => {
    // Permission.get({ gid }) returns the GROUP-level permission (uid IS NULL),
    // not a user's permission — even when the user perm also stores a gid.
    const p = await Permission.get({ gid: groupTestCase.id })
    assert.ok(p, 'group permission exists')
    assert.equal(p.group.id, groupTestCase.id)
    assert.equal(p.name, `Group ${groupTestCase.name} perms`)
  })

  it('getGroup: gets group permissions', async () => {
    // getGroup returns the group-level permission for the user's group
    const p = await Permission.getGroup({ uid: userTestCase.id })
    assert.ok(p, 'group permission exists for user')
    assert.equal(p.group.id, groupTestCase.id)
  })

  it('changes a permission', async () => {
    assert.ok(await Permission.put({ id: permTestCase.id, name: 'Changed' }))
    const perm = await Permission.get({ id: permTestCase.id })
    assert.deepEqual(perm.name, 'Changed')
    assert.ok(await Permission.put({ id: permTestCase.id, name: 'Test Permission' }))
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
