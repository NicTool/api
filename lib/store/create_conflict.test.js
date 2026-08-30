import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import Group from '../group/index.js'
import Nameserver from '../nameserver/index.js'
import Permission from '../permission/index.js'
import User from '../user/index.js'
import Zone from '../zone/index.js'
import ZoneRecord from '../zone_record/index.js'

const group = { id: 62000, parent_gid: 0, name: 'conflict-group' }
const nameserver = {
  id: 62001,
  gid: group.id,
  name: 'conflict.ns.example.com.',
  address: '203.0.113.1',
  ttl: 3600,
  type: 'nsd',
}
const user = {
  id: 62002,
  gid: group.id,
  username: 'conflict-user',
  email: 'conflict@example.com',
  password: 'Tw0-G00d#Passwords',
  first_name: 'Conflict',
  last_name: 'User',
}
const zone = {
  id: 62003,
  gid: group.id,
  zone: 'conflict.example.com.',
  mailaddr: 'hostmaster.conflict.example.com.',
  serial: 2026082901,
  refresh: 3600,
  retry: 600,
  expire: 86400,
  minimum: 300,
  ttl: 300,
}
const zoneRecord = {
  id: 62004,
  zid: zone.id,
  owner: 'www.conflict.example.com.',
  ttl: 300,
  type: 'A',
  address: '203.0.113.2',
}
const permission = {
  id: 62005,
  name: 'conflict permission',
  group: { id: 62999 },
  user: { id: 62999 },
}

const cases = [
  ['group', Group, group, 'name', 'changed-group'],
  ['nameserver', Nameserver, nameserver, 'name', 'changed.ns.example.com.'],
  ['user', User, user, 'username', 'changed-user'],
  ['zone', Zone, zone, 'zone', 'changed.example.com.'],
  ['zone record', ZoneRecord, zoneRecord, 'owner', 'changed.conflict.example.com.'],
  ['permission', Permission, permission, 'name', 'changed permission'],
]

let userPermissionId

before(async () => {
  await Permission.destroy({ id: permission.id })
  await ZoneRecord.destroy({ id: zoneRecord.id })
  await Zone.destroy({ id: zone.id })
  await User.destroy({ id: user.id })
  await Nameserver.destroy({ id: nameserver.id })
  await Group.destroy({ id: group.id })

  for (const [, store, original] of cases) await store.create(structuredClone(original))
})

after(async () => {
  if (userPermissionId !== undefined) await Permission.destroy({ id: userPermissionId })
  await Permission.destroy({ id: permission.id })
  await ZoneRecord.destroy({ id: zoneRecord.id })
  await Zone.destroy({ id: zone.id })
  await User.destroy({ id: user.id })
  await Nameserver.destroy({ id: nameserver.id })
  await Group.destroy({ id: group.id })
  await Group.disconnect()
})

describe('create id conflicts', () => {
  for (const [entity, store, original, field, changed] of cases) {
    it(`${entity} rejects the collision and leaves the existing row untouched`, async () => {
      await assert.rejects(store.create({ ...structuredClone(original), [field]: changed }), /already exists/)

      const result = await store.get({ id: original.id })
      const existing = Array.isArray(result) ? result[0] : result
      assert.equal(existing[field], original[field])
    })
  }

  it('permission rejects a second create for the same user', async () => {
    const original = {
      name: 'user permission',
      user: { id: user.id },
      group: { id: group.id },
    }
    userPermissionId = await Permission.create(structuredClone(original))

    await assert.rejects(
      Permission.create({ ...structuredClone(original), name: 'changed user permission' }),
      /already exists/,
    )

    const existing = await Permission.get({ id: userPermissionId })
    assert.equal(existing.name, original.name)
  })

  it('rejects an id collision with a deleted row', async () => {
    await ZoneRecord.delete({ id: zoneRecord.id })

    await assert.rejects(
      ZoneRecord.create({ ...structuredClone(zoneRecord), owner: 'changed.conflict.example.com.' }),
      /already exists/,
    )

    const [existing] = await ZoneRecord.get({ id: zoneRecord.id, deleted: true })
    assert.equal(existing.owner, zoneRecord.owner)
    await ZoneRecord.delete({ id: zoneRecord.id, deleted: false })
  })
})
