import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from '../index.js'

import groupJson from '../test/group.json' with { type: 'json' }

// This suite renames and soft-deletes its group, so it uses a private group
// rather than the shared fixture that the concurrently-run user and permission
// suites depend on staying live and named.
const testCase = { ...groupJson, id: 4088, name: 'grouptest.example.com' }
const moveParentA = { ...groupJson, id: 4070, name: 'group-move-a.example.com' }
const moveParentB = { ...groupJson, id: 4071, name: 'group-move-b.example.com' }
const moveChild = {
  ...groupJson,
  id: 4072,
  parent_gid: moveParentA.id,
  name: 'group-move-child.example.com',
}
const moveGrandchild = {
  ...groupJson,
  id: 4073,
  parent_gid: moveChild.id,
  name: 'group-move-grandchild.example.com',
}

after(async () => {
  await Group.destroy({ id: moveGrandchild.id })
  await Group.destroy({ id: moveChild.id })
  await Group.destroy({ id: moveParentB.id })
  await Group.destroy({ id: moveParentA.id })
  await Group.destroy({ id: testCase.id })
  Group.disconnect()
})

describe('group', function () {
  before(async () => {
    await Group.create(testCase)
    await Group.create(moveParentA)
    await Group.create(moveParentB)
    await Group.create(moveChild)
    await Group.create(moveGrandchild)
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

  it('rebuilds authorization ancestry when a group moves', async () => {
    assert.ok((await Group.subgroupGids(moveParentA.id)).includes(moveChild.id))
    assert.ok(!(await Group.subgroupGids(moveParentB.id)).includes(moveChild.id))

    assert.ok(await Group.put({ id: moveChild.id, parent_gid: moveParentB.id }))

    const oldBranch = await Group.subgroupGids(moveParentA.id)
    const newBranch = await Group.subgroupGids(moveParentB.id)
    assert.ok(!oldBranch.includes(moveChild.id))
    assert.ok(!oldBranch.includes(moveGrandchild.id))
    assert.ok(newBranch.includes(moveChild.id))
    assert.ok(newBranch.includes(moveGrandchild.id))
  })

  it('deletes a group', async () => {
    assert.ok(await Group.delete({ id: testCase.id }))
    let g = await Group.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await Group.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await Group.get({ id: testCase.id })
    assert.equal(g[0].deleted, undefined)
  })
})
