import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from './group.js'

import testCase from './test/group.json' with { type: 'json' }

after(async () => {
  Group.mysql.disconnect()
})

describe('group', function () {
  before(async () => {
    await Group.create(testCase)
  })

  it('gets group by id', async () => {
    const g = await Group.get({ id: testCase.id })
    assert.deepEqual(g[0], {
      id: testCase.id,
      name: testCase.name,
      parent_gid: 0,
    })
  })

  it('gets group by name', async () => {
    const g = await Group.get({ name: testCase.name })
    assert.deepEqual(g[0], {
      id: testCase.id,
      name: testCase.name,
      parent_gid: 0,
    })
  })

  it('changes a group', async () => {
    assert.ok(await Group.put({ id: testCase.id, name: 'example.net' }))
    assert.deepEqual(await Group.get({ id: testCase.id }), [
      {
        id: testCase.id,
        name: 'example.net',
        parent_gid: 0,
      },
    ])
    assert.ok(
      await Group.put({ id: testCase.id, name: testCase.name }),
    )
  })

  it('deletes a group', async () => {
    assert.ok(await Group.delete({ id: testCase.id }))
    let g = await Group.getAdmin({ id: testCase.id })
    assert.equal(g[0].deleted, 1)
    await Group.delete({ id: testCase.id }, 0) // restore
    g = await Group.getAdmin({ id: testCase.id })
    assert.equal(g[0].deleted, 0)
  })
})
