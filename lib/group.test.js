const assert = require('node:assert/strict')
const { describe, it, after } = require('node:test')

const group = require('./group')

after(async () => {
  group._mysql.disconnect()
})

describe('group', function () {
  it('gets group by id', async () => {
    const g = await group.get({ id: 4096 })
    assert.deepEqual(g[0], {
      id: 4096,
      name: 'example.com',
    })
  })

  it('gets group by name', async () => {
    const u = await group.get({ name: 'example.com' })
    assert.deepEqual(u[0], {
      id: 4096,
      name: 'example.com',
    })
  })

  it('changes a group', async () => {
    assert.ok(await group.put({ id: 4096, name: 'example.net' }))
    assert.deepEqual(await group.get({ id: 4096 }), [
      {
        id: 4096,
        name: 'example.net',
      },
    ])
    assert.ok(await group.put({ id: 4096, name: 'example.com' }))
  })

  it('deletes a group', async () => {
    assert.ok(await group.delete({ id: 4096 }))
    let u = await group.getAdmin({ id: 4096 })
    assert.equal(u[0].deleted, 1)
    await group.delete({ id: 4096 }, 0) // restore
    u = await group.getAdmin({ id: 4096 })
    assert.equal(u[0].deleted, 0)
  })
})
