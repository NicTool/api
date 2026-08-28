import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from '../../group/index.js'
import User from '../../user/index.js'
import Permission from '../index.js'

import groupTestCase from '../../group/test/group.json' with { type: 'json' }
import userTestCase from '../../user/test/user.json' with { type: 'json' }
import permTestCase from './permission.json' with { type: 'json' }

before(async () => {
  await Group.create({ id: 1, parent_gid: 0, name: 'root' })
  await Permission.create({ gid: 1, name: 'Root group permissions' })
  await Group.create(groupTestCase)
  await User.create(userTestCase)
})

after(async () => {
  await Permission.disconnect()
})

describe('permission', function () {
  it('reads the seeded v2-style group permission row', async () => {
    const p = await Permission.get({ gid: 1 })
    assert.ok(p)
    assert.equal(p.group.id, 1)
    assert.equal(p.user.id, null)
  })

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
    assert.ok(await Permission.put({
      id: permTestCase.id,
      name: 'Changed',
      group_write: 1,
    }))
    const perm = await Permission.get({ id: permTestCase.id })
    assert.deepEqual(perm.name, 'Changed')
    assert.equal(perm.group.write, true)
    assert.equal(perm.group_write, undefined)
    assert.ok(await Permission.put({
      id: permTestCase.id,
      name: 'Test Permission',
      group_write: 0,
    }))
  })

  it('finds a group permission by its id', async () => {
    const gid = 4300
    await Group.destroy({ id: gid })
    await Group.create({ id: gid, parent_gid: groupTestCase.id, name: 'perm-by-id' })
    const gp = await Permission.get({ gid })
    assert.equal((await Permission.get({ id: gp.id }))?.group.id, gid)
    await Group.destroy({ id: gid })
  })

  it('stops applying a deleted explicit permission', async () => {
    await Permission.delete({ id: permTestCase.id })
    assert.equal(await Permission.get({ uid: userTestCase.id }), undefined)
    const effective = await Permission.getEffective(userTestCase.id)
    assert.equal(effective.group.id, groupTestCase.id)
    assert.equal(effective.name, `Group ${groupTestCase.name} perms`)
    await Permission.delete({ id: permTestCase.id, deleted: 0 })
  })

  it('reactivates a soft-deleted permission instead of duplicating it', async () => {
    await Permission.delete({ id: permTestCase.id })
    assert.equal(await Permission.create(permTestCase), permTestCase.id)
    assert.ok(await Permission.get({ id: permTestCase.id }))
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
    const p = await Permission.get({ uid: userTestCase.id })
    assert.equal(p, undefined)
  })
})
