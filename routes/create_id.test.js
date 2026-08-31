import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import Group from '../lib/group/index.js'
import Nameserver from '../lib/nameserver/index.js'
import Permission from '../lib/permission/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'
import ZoneRecord from '../lib/zone_record/index.js'
import { init } from './index.js'

import groupCase from './test/group.json' with { type: 'json' }
import nameserverCase from './test/nameserver.json' with { type: 'json' }
import permissionCase from './test/permission.json' with { type: 'json' }
import userCase from './test/user.json' with { type: 'json' }
import zoneCase from './test/zone.json' with { type: 'json' }

const chosenId = 65001
let server
const auth = { headers: {} }

const userPayload = {
  ...userCase,
  id: chosenId,
  gid: groupCase.id,
  email: 'caller-id@example.com',
  username: 'caller-id-user',
}
delete userPayload.deleted

const cases = [
  ['group', { ...groupCase, id: chosenId, name: 'caller-id-group' }],
  ['nameserver', { ...nameserverCase, id: chosenId, gid: groupCase.id, name: 'caller-id.ns.example.com.' }],
  [
    'permission',
    {
      ...permissionCase,
      id: chosenId,
      group: { ...permissionCase.group, id: chosenId },
      user: { ...permissionCase.user, id: chosenId },
    },
  ],
  ['user', userPayload],
  ['zone', { ...zoneCase, id: chosenId, gid: groupCase.id, zone: 'caller-id.example.com.' }],
  [
    'zone_record',
    {
      id: chosenId,
      zid: zoneCase.id,
      owner: 'caller-id.route.example.com.',
      ttl: 300,
      type: 'A',
      address: '203.0.113.111',
    },
  ],
]

before(async () => {
  const fixture = { ifExists: 'return' }
  await ZoneRecord.destroy({ id: chosenId })
  await Zone.destroy({ id: chosenId })
  await User.destroy({ id: chosenId })
  await Permission.destroy({ id: chosenId })
  await Nameserver.destroy({ id: chosenId })
  await Group.destroy({ id: chosenId })
  await Group.create(groupCase, fixture)
  await User.create(userCase, fixture)
  await Zone.create(zoneCase, fixture)
  server = await init()

  const res = await server.inject({
    method: 'POST',
    url: '/session',
    payload: {
      username: `${userCase.username}@${groupCase.name}`,
      password: userCase.password,
    },
  })
  assert.equal(res.statusCode, 200)
  auth.headers = { Authorization: `Bearer ${res.result.session.token}` }
})

after(async () => {
  await ZoneRecord.destroy({ id: chosenId })
  await Zone.destroy({ id: chosenId })
  await User.destroy({ id: chosenId })
  await Permission.destroy({ id: chosenId })
  await Nameserver.destroy({ id: chosenId })
  await Group.destroy({ id: chosenId })
  if (server) await server.stop()
})

describe('caller-supplied create ids', () => {
  for (const [entity, payload] of cases) {
    it(`rejects an id on POST /${entity}`, async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/${entity}`,
        headers: auth.headers,
        payload,
      })

      assert.equal(res.statusCode, 400)
      assert.match(res.result.message, /"id" is not allowed/)
    })
  }
})
