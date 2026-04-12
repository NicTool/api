import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone.js'
import ZoneRecord from '../lib/zone_record.js'
import Nameserver from '../lib/nameserver.js'
import Permission from '../lib/permission.js'
import Delegation from '../lib/delegation.js'
import Mysql from '../lib/mysql.js'

const G_ROOT = {
  id: 4200,
  parent_gid: 0,
  name: 'authz-root',
}
const G_CHILD = {
  id: 4201,
  parent_gid: 4200,
  name: 'authz-child',
}
const G_OUTSIDE = {
  id: 4202,
  parent_gid: 0,
  name: 'authz-outside',
}

const PASSWORD = 'Wh@tA-Decent#P6ssw0rd'

const U_FULL = {
  id: 4200,
  gid: 4200,
  username: 'authz-full',
  email: 'authz-full@example.com',
  password: PASSWORD,
  first_name: 'Full',
  last_name: 'Perm',
  inherit_group_permissions: false,
}
const U_LIMITED = {
  id: 4201,
  gid: 4202,
  username: 'authz-limited',
  email: 'authz-limited@example.com',
  password: PASSWORD,
  first_name: 'Limited',
  last_name: 'Perm',
  inherit_group_permissions: false,
}

const Z_INTREE = {
  id: 4200,
  gid: 4200,
  zone: 'authz.example.com.',
  mailaddr: 'hostmaster.authz.example.com.',
  serial: 1,
  refresh: 3600,
  retry: 900,
  expire: 604800,
  minimum: 86400,
  ttl: 3600,
}
const Z_OUTSIDE = {
  id: 4201,
  gid: 4202,
  zone: 'authz-out.example.com.',
  mailaddr: 'hostmaster.authz-out.example.com.',
  serial: 1,
  refresh: 3600,
  retry: 900,
  expire: 604800,
  minimum: 86400,
  ttl: 3600,
}

const ZR_INTREE = {
  id: 4200,
  zid: 4200,
  owner: 'test.authz.example.com.',
  type: 'A',
  address: '192.0.2.1',
  ttl: 3600,
}
const ZR_OUTSIDE = {
  id: 4201,
  zid: 4201,
  owner: 'test.authz-out.example.com.',
  type: 'A',
  address: '192.0.2.2',
  ttl: 3600,
}

const NS = {
  id: 4200,
  gid: 4200,
  name: 'ns1.authz.example.com.',
  ttl: 3600,
  description: 'authz test ns',
  address: '192.0.2.10',
  export: { type: 'bind', interval: 0, serials: 0 },
}

let server
const authFull = { headers: {} }
const authLimited = { headers: {} }

before(async () => {
  // Clean up stale data from prior crashed runs
  try { await Delegation.delete({ gid: 4200, oid: 4201, type: 'ZONE' }) }
  catch { /* ignore */ }
  for (const id of [4200, 4201]) {
    await ZoneRecord.destroy({ id })
    await Zone.destroy({ id })
  }
  await Nameserver.destroy({ id: 4200 })
  for (const id of [4200, 4201]) {
    const p = await Permission.get({ uid: id })
    if (p) await Permission.destroy({ id: p.id })
    await User.destroy({ id })
  }
  for (const id of [4201, 4202, 4200]) await Group.destroy({ id })
  await Mysql.execute(
    'DELETE FROM nt_group_subgroups WHERE nt_subgroup_id IN (?, ?, ?)',
    [4200, 4201, 4202],
  )

  for (const g of [G_ROOT, G_CHILD, G_OUTSIDE]) await Group.create(g)
  for (const u of [U_FULL, U_LIMITED]) await User.create(u)

  // Full permissions for user 4200
  const fullPerm = await Permission.get({ uid: U_FULL.id })
  if (fullPerm) {
    await Permission.put({
      id: fullPerm.id,
      self_write: 1,
      group_write: 1, group_create: 1, group_delete: 1,
      zone_write: 1, zone_create: 1, zone_delete: 1, zone_delegate: 1,
      zonerecord_write: 1, zonerecord_create: 1, zonerecord_delete: 1,
      zonerecord_delegate: 1,
      user_write: 1, user_create: 1, user_delete: 1,
      nameserver_write: 1, nameserver_create: 1, nameserver_delete: 1,
      usable_ns: '4200',
    })
  }

  // No permissions for user 4201
  const limPerm = await Permission.get({ uid: U_LIMITED.id })
  if (limPerm) {
    await Permission.put({
      id: limPerm.id,
      self_write: 0,
      group_write: 0, group_create: 0, group_delete: 0,
      zone_write: 0, zone_create: 0, zone_delete: 0, zone_delegate: 0,
      zonerecord_write: 0, zonerecord_create: 0, zonerecord_delete: 0,
      zonerecord_delegate: 0,
      user_write: 0, user_create: 0, user_delete: 0,
      nameserver_write: 0, nameserver_create: 0, nameserver_delete: 0,
      usable_ns: '',
    })
  }

  await Zone.create(Z_INTREE)
  await Zone.create(Z_OUTSIDE)
  await ZoneRecord.create(ZR_INTREE)
  await ZoneRecord.create(ZR_OUTSIDE)
  await Nameserver.create(NS)

  // Delegation: zone 4201 → group 4200, write=yes delete=no
  await Delegation.create({
    gid: 4200, oid: 4201, type: 'ZONE',
    perm_write: true, perm_delete: false, perm_delegate: true,
  })

  server = await init()

  // Login full-perm user
  const r1 = await server.inject({
    method: 'POST',
    url: '/session',
    payload: {
      username: `${U_FULL.username}@${G_ROOT.name}`,
      password: PASSWORD,
    },
  })
  assert.equal(r1.statusCode, 200, `full login failed: ${JSON.stringify(r1.result)}`)
  authFull.headers = {
    Authorization: `Bearer ${r1.result.session.token}`,
  }

  // Login limited user
  const r2 = await server.inject({
    method: 'POST',
    url: '/session',
    payload: {
      username: `${U_LIMITED.username}@${G_OUTSIDE.name}`,
      password: PASSWORD,
    },
  })
  assert.equal(r2.statusCode, 200, `limited login failed: ${JSON.stringify(r2.result)}`)
  authLimited.headers = {
    Authorization: `Bearer ${r2.result.session.token}`,
  }
})

after(async () => {
  await server.stop()
  await Delegation.delete({ gid: 4200, oid: 4201, type: 'ZONE' })
  await Nameserver.destroy({ id: NS.id })
  await ZoneRecord.destroy({ id: ZR_OUTSIDE.id })
  await ZoneRecord.destroy({ id: ZR_INTREE.id })
  await Zone.destroy({ id: Z_OUTSIDE.id })
  await Zone.destroy({ id: Z_INTREE.id })
  for (const u of [U_LIMITED, U_FULL]) {
    const p = await Permission.get({ uid: u.id })
    if (p) await Permission.destroy({ id: p.id })
    await User.destroy({ id: u.id })
  }
  for (const g of [G_CHILD, G_OUTSIDE, G_ROOT]) {
    await Group.destroy({ id: g.id })
  }
  await Mysql.execute(
    'DELETE FROM nt_group_subgroups WHERE nt_subgroup_id IN (?, ?, ?)',
    [4200, 4201, 4202],
  )
  await Mysql.disconnect()
})

describe('authz plugin - zone routes', () => {
  it('200 for GET /zone/{id} with full-perm user (in-tree)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${Z_INTREE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('200 for GET /zone/{id} with full-perm user (delegated)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${Z_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('403 for GET /zone/{id} with limited user (out of tree)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone/${Z_INTREE.id}`,
      headers: authLimited.headers,
    })
    assert.equal(res.statusCode, 403)
    assert.ok(res.result.error_code)
  })

  it('200 for GET /zone (list, no per-object check)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/zone',
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('403 for POST /zone when user lacks zone.create', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: authLimited.headers,
      payload: {
        gid: 4202,
        zone: 'denied.example.com.',
        mailaddr: 'hostmaster.denied.example.com.',
        serial: 1,
        refresh: 3600,
        retry: 900,
        expire: 604800,
        minimum: 86400,
        ttl: 3600,
      },
    })
    assert.equal(res.statusCode, 403)
  })

  it('200 for PUT /zone/{id} with full-perm user', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${Z_INTREE.id}`,
      headers: authFull.headers,
      payload: { ttl: 7200 },
    })
    assert.equal(res.statusCode, 200)
  })

  it('403 for DELETE /zone/{id} with delegated perm_delete=0', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${Z_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
  })
})

describe('authz plugin - user self-ops', () => {
  it('403 for DELETE /user/{self}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /Not allowed to delete self/)
  })

  it('403 for PUT /user/{self} when self_write=false', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_LIMITED.id}`,
      headers: authLimited.headers,
      payload: { first_name: 'Nope' },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /Not allowed to modify self/)
  })
})

describe('authz plugin - group self-ops', () => {
  it('403 for PUT /group/{own-group}', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/group/${G_ROOT.id}`,
      headers: authFull.headers,
      payload: { name: 'nope' },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /Not allowed to edit your own group/)
  })

  it('403 for DELETE /group/{own-group}', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/group/${G_ROOT.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
    assert.match(
      res.result.error_msg,
      /Not allowed to delete your own group/,
    )
  })
})

describe('authz plugin - zone record delegation', () => {
  it('200 for GET /zone_record/{id} via pseudo-delegation', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone_record/${ZR_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
  })

  it('403 for GET /zone_record/{id} with limited user', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone_record/${ZR_INTREE.id}`,
      headers: authLimited.headers,
    })
    assert.equal(res.statusCode, 403)
  })
})
