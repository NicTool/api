import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import Group from './group.js'
const group = new Group()
import testCase from '../test/v3/group.json' with { type: 'json' }

after(async () => {
  group.mysql.disconnect()
})

describe('group', function () {
  it('gets group by id', async () => {
    const g = await group.get({ id: testCase.id })
    assert.deepEqual(g[0], {
      id: testCase.id,
      name: testCase.name,
      parent_gid: 0,
    })
  })

  it('gets group by name', async () => {
    const g = await group.get({ name: testCase.name })
    assert.deepEqual(g[0], {
      id: testCase.id,
      name: testCase.name,
      parent_gid: 0,
    })
  })

  it('changes a group', async () => {
    assert.ok(await group.put({ id: testCase.id, name: 'example.net' }))
    assert.deepEqual(await group.get({ id: testCase.id }), [
      {
        id: testCase.id,
        name: 'example.net',
        parent_gid: 0,
      },
    ])
    assert.ok(
      await group.put({ id: testCase.id, name: testCase.name }),
    )
  })

  it('deletes a group', async () => {
    assert.ok(await group.delete({ id: testCase.id }))
    let g = await group.getAdmin({ id: testCase.id })
    assert.equal(g[0].deleted, 1)
    await group.delete({ id: testCase.id }, 0) // restore
    g = await group.getAdmin({ id: testCase.id })
    assert.equal(g[0].deleted, 0)
  })
})
