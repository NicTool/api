import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import Group from '../index.js'

import groupJson from './group.json' with { type: 'json' }

const parent = { ...groupJson, id: 9020, name: 'grouptest-mysql.example.com' }
const ids = [9021, 9022, 9023, 9024]
const racer = (id) => ({ ...groupJson, id, parent_gid: parent.id, name: 'racer.example.com' })
const settled = (results) => results.filter((r) => r.status === 'fulfilled').length

const shared = { ...groupJson, id: 9025, parent_gid: parent.id, name: 'shared.example.com' }
const twin = { ...shared, id: 9026, parent_gid: 0 }

async function cleanup() {
  await Group.mysql.execute('DELETE FROM nt_user WHERE nt_user_id IN (9027, 9028)')
  for (const id of [shared.id, twin.id, ...ids, parent.id]) await Group.destroy({ id })
}

before(async () => {
  await cleanup()
  await Group.create(parent)
})

after(async () => {
  await cleanup()
  Group.disconnect()
})

describe('mysql group name races', () => {
  it('lets one of several concurrent creates of a name win', async () => {
    const results = await Promise.allSettled(ids.map((id) => Group.create(racer(id))))
    assert.equal(settled(results), 1)
    for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.code, 'STORE_CONFLICT')
    assert.equal((await Group.get({ parent_gid: parent.id, name: 'racer.example.com' })).length, 1)
    for (const id of ids) await Group.destroy({ id })
  })

  it('lets a create or a rename onto the same name win, not both', async () => {
    assert.ok(await Group.create({ ...racer(ids[0]), name: 'renamer.example.com' }))
    const results = await Promise.allSettled([
      Group.create(racer(ids[1])),
      Group.put({ id: ids[0], name: 'racer.example.com' }),
    ])
    assert.equal(settled(results), 1)
    for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.code, 'STORE_CONFLICT')
    assert.equal((await Group.get({ parent_gid: parent.id, name: 'racer.example.com' })).length, 1)
  })
})

describe('mysql group moves', () => {
  it('leave the logins of an upgraded db alone', async () => {
    for (const g of [shared, twin]) await Group.create(g)
    // two live groups of one name sharing a login, as a v2 db can hold
    for (const [id, gid] of [
      [9027, shared.id],
      [9028, twin.id],
    ]) {
      await Group.mysql.execute(
        'INSERT INTO nt_user (nt_user_id, nt_group_id, username, password, email) VALUES (?, ?, ?, ?, ?)',
        [id, gid, 'amy', 'x', `amy${id}@example.com`],
      )
    }
    assert.ok(await Group.put({ id: shared.id, parent_gid: twin.id }))
    await assert.rejects(Group.put({ id: shared.id, name: 'shared.example.com', parent_gid: parent.id }), {
      message: 'username amy@shared.example.com is not unique',
    })
  })
})
