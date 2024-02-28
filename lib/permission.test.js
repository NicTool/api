import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import Permission from './permission.js'
import permTestCase from '../test/v3/permission.json' with { type: 'json' }

const permission = new Permission()

after(async () => {
  permission.mysql.disconnect()
})

describe('permission', function () {
  it('creates a permission', async () => {
    assert.ok(await permission.create(permTestCase))
  })

  it('gets permission by id', async () => {
    const g = await permission.get({ id: permTestCase.id })
    assert.deepEqual(g[0], permTestCase)
  })

  it('gets permission by user id', async () => {
    const g = await permission.get({ uid: permTestCase.uid })
    assert.deepEqual(g[0], permTestCase)
  })

  it('gets permission by group id', async () => {
    const g = await permission.get({ uid: permTestCase.gid })
    assert.deepEqual(g[0], permTestCase)
  })

  it('changes a permission', async () => {
    assert.ok(await permission.put({ id: permTestCase.id, name: 'Changed' }))
    const perms = await permission.get({ id: permTestCase.id })
    assert.deepEqual(perms[0].name, 'Changed')
    assert.ok(
      await permission.put({ id: permTestCase.id, name: 'Test Permission' }),
    )
  })

  it('deletes a permission', async () => {
    assert.ok(await permission.delete({ id: permTestCase.id }))
    let u = await permission.get({ id: permTestCase.id })
    assert.equal(u[0].deleted, true)
    await permission.delete({ id: permTestCase.id }, 0) // restore
    u = await permission.get({ id: permTestCase.id })
    assert.equal(u[0].deleted, false)
  })
})
