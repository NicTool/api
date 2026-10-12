import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

import Permission from '../index.js'

after(async () => {
  await Permission.disconnect()
})

describe('permission (mysql)', function () {
  it('reads the seeded v2 group permission row', async () => {
    const [row] = await Permission.mysql.execute('SELECT nt_user_id FROM nt_perm WHERE nt_perm_id = 1')
    assert.equal(row.nt_user_id, 0)

    const p = await Permission.get({ gid: 1 })
    assert.equal(p?.id, 1)
    assert.equal(p.user.id, null)
  })
})
