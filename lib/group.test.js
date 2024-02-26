const assert = require('node:assert/strict')
const { describe, it, after } = require('node:test')

const group = require('./group')
const groupTestCase = require('../test/v3/group')

after(async () => {
  group._mysql.disconnect()
})

describe('group', function () {
  it('gets group by id', async () => {
    const g = await group.get({ id: groupTestCase.id })
    assert.deepEqual(g[0], {
      id: groupTestCase.id,
      name: groupTestCase.name,
      parent_gid: 0,
    })
  })

  it('gets group by name', async () => {
    const g = await group.get({ name: groupTestCase.name })
    assert.deepEqual(g[0], {
      id: groupTestCase.id,
      name: groupTestCase.name,
      parent_gid: 0,
    })
  })

  it('changes a group', async () => {
    assert.ok(await group.put({ id: groupTestCase.id, name: 'example.net' }))
    assert.deepEqual(await group.get({ id: groupTestCase.id }), [
      {
        id: groupTestCase.id,
        name: 'example.net',
        parent_gid: 0,
      },
    ])
    assert.ok(
      await group.put({ id: groupTestCase.id, name: groupTestCase.name }),
    )
  })

  it('deletes a group', async () => {
    assert.ok(await group.delete({ id: groupTestCase.id }))
    let g = await group.getAdmin({ id: groupTestCase.id })
    assert.equal(g[0].deleted, 1)
    await group.delete({ id: groupTestCase.id }, 0) // restore
    g = await group.getAdmin({ id: groupTestCase.id })
    assert.equal(g[0].deleted, 0)
  })
})
