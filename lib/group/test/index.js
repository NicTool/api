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
    await Group.create(testCase)
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

  it('deletes a group', async () => {
    assert.ok(await Group.delete({ id: testCase.id }))
    let g = await Group.get({ id: testCase.id, deleted: 1 })
    assert.equal(g[0]?.deleted, true)
    await Group.delete({ id: testCase.id, deleted: 0 }) // restore
    g = await Group.get({ id: testCase.id })
    assert.equal(g[0].deleted, undefined)
  })
})
