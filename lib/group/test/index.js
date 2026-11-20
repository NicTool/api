import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from '../index.js'

import groupJson from '../test/group.json' with { type: 'json' }

// This suite renames and soft-deletes its group, so it uses a private group
// rather than the shared fixture that the concurrently-run user and permission
// suites depend on staying live and named.
const testCase = { ...groupJson, id: 4088, name: 'grouptest.example.com' }

after(async () => {
  await Group.destroy({ id: testCase.id })
  Group.disconnect()
})

describe('group', function () {
  before(async () => {
    await Group.create(testCase, { ifExists: 'return' })
  })

  it('gets group by id', async () => {
    const g = await Group.get({ id: testCase.id })
    assert.equal(g[0].id, testCase.id)
    assert.equal(g[0].name, testCase.name)
    assert.equal(g[0].parent_gid, 0)
    assert.ok(g[0].permissions, 'group has permissions')
  })

  it('gets group by name', async () => {
    const g = await Group.get({ name: testCase.name })
    assert.equal(g[0].id, testCase.id)
    assert.equal(g[0].name, testCase.name)
    assert.equal(g[0].parent_gid, 0)
    assert.ok(g[0].permissions, 'group has permissions')
  })

  it('changes a group', async () => {
    assert.ok(await Group.put({ id: testCase.id, name: 'example.net' }))
    const g = await Group.get({ id: testCase.id })
    assert.equal(g[0].id, testCase.id)
    assert.equal(g[0].name, 'example.net')
    assert.ok(await Group.put({ id: testCase.id, name: testCase.name }))
  })

  it('stores usable nameservers on the group permission', async () => {
    assert.ok(await Group.put({ id: testCase.id, usable_ns: ['3', '5'] }))
    const g = await Group.get({ id: testCase.id })
    assert.deepEqual(g[0].permissions.nameserver.usable, ['3', '5'])
    await Group.put({ id: testCase.id, usable_ns: [] })
  })

  it('deletes a group', async () => {
    assert.ok(await Group.delete({ id: testCase.id }))
    let g = await Group.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await Group.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await Group.get({ id: testCase.id })
    assert.equal(g[0].deleted, undefined)
  })

  describe('sibling names', function () {
    const sib = { ...groupJson, id: 4092, parent_gid: testCase.id, name: 'sibling.example.com' }
    const other = { ...groupJson, id: 4093, parent_gid: testCase.id, name: 'other.example.com' }
    const loose = { ...sib, id: 4094, parent_gid: 0 }
    const conflict = {
      code: 'STORE_CONFLICT',
      message: `group ${sib.name} already exists in group ${testCase.id}`,
    }

    before(async () => {
      for (const g of [sib, other, loose]) await Group.destroy({ id: g.id })
      for (const g of [sib, other]) await Group.create(g)
    })

    after(async () => {
      for (const g of [sib, other, loose]) await Group.destroy({ id: g.id })
    })

    it('is unique among live siblings', async () => {
      await assert.rejects(Group.create({ ...loose, parent_gid: testCase.id }), conflict)
      for (const deleted of [false, true]) assert.deepEqual(await Group.get({ id: loose.id, deleted }), [])
      assert.ok(await Group.create(loose))
      await Group.destroy({ id: loose.id })
    })

    it('puts a group created without a parent at the top level', async () => {
      assert.ok(await Group.create({ id: loose.id, name: loose.name }))
      assert.equal((await Group.get({ parent_gid: 0, name: loose.name })).length, 1)
      await Group.destroy({ id: loose.id })
    })

    it('refuses a rename or a move onto a sibling', async () => {
      await assert.rejects(Group.put({ id: other.id, name: sib.name }), conflict)
      assert.equal((await Group.get({ id: other.id }))[0].name, other.name)
      assert.ok(await Group.create(loose))
      await assert.rejects(Group.put({ id: loose.id, parent_gid: testCase.id }), conflict)
      assert.equal((await Group.get({ id: loose.id }))[0].parent_gid, 0)
      await Group.destroy({ id: loose.id })
    })

    it('is free while the sibling is deleted', async () => {
      await Group.delete({ id: sib.id })
      try {
        assert.ok(await Group.put({ id: other.id, name: sib.name }))
        await assert.rejects(Group.delete({ id: sib.id, deleted: 0 }), conflict)
        assert.ok(await Group.put({ id: other.id, name: other.name }))
      } finally {
        await Group.delete({ id: sib.id, deleted: 0 })
      }
      assert.equal((await Group.get({ id: sib.id }))[0].name, sib.name)
    })
  })
})
