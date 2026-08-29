import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'

import { init } from './index.js'
import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'
import ZoneRecord from '../lib/zone_record/index.js'
import Nameserver from '../lib/nameserver/index.js'
import Permission from '../lib/permission/index.js'
import Audit from '../lib/audit/index.js'
import Delegation from '../lib/delegation/index.js'
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
const U_CREATED = {
  id: 4211,
  gid: 4201,
  username: 'authz-created',
  email: 'authz-created@example.com',
  password: PASSWORD,
  first_name: 'Created',
  last_name: 'User',
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

const ZR_INTREE_OTHER = {
  id: 4203,
  zid: 4200,
  owner: 'other.authz.example.com.',
  type: 'A',
  address: '192.0.2.3',
  ttl: 3600,
}

const ZR_DELEGATED_CREATE = {
  id: 4210,
  zid: 4201,
  owner: 'created.authz-out.example.com.',
  type: 'A',
  address: '192.0.2.10',
  ttl: 3600,
}

const NS = {
  id: 4200,
  gid: 4200,
  name: 'ns1.authz.example.com.',
  type: 'bind',
  ttl: 3600,
  description: 'authz test ns',
  address: '192.0.2.10',
  export: { interval: 0, serials: 0 },
}

let server
const authFull = { headers: {} }
const authLimited = { headers: {} }

before(async () => {
  // Clean up stale data from prior crashed runs
  try {
    await Delegation.delete({ gid: 4200, oid: 4201, type: 'ZONE' })
  } catch {
    /* ignore */
  }
  try {
    await Delegation.delete({ gid: 4201, oid: 4200, type: 'ZONE' })
  } catch {
    /* ignore */
  }
  try {
    await Delegation.delete({ gid: 4201, oid: 4201, type: 'ZONE' })
  } catch {
    /* ignore */
  }
  await ZoneRecord.destroy({ id: ZR_DELEGATED_CREATE.id })
  for (const id of [4200, 4201, ZR_INTREE_OTHER.id, U_CREATED.id]) {
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
  await Mysql.execute('DELETE FROM nt_group_subgroups WHERE nt_subgroup_id IN (?, ?, ?)', [4200, 4201, 4202])

  for (const g of [G_ROOT, G_CHILD, G_OUTSIDE]) await Group.create(g)
  for (const u of [U_FULL, U_LIMITED]) await User.create(u)

  // Full permissions for user 4200
  const fullPerm = await Permission.get({ uid: U_FULL.id })
  if (fullPerm) {
    await Permission.put({
      id: fullPerm.id,
      self_write: 1,
      group_write: 1,
      group_create: 1,
      group_delete: 1,
      zone_write: 1,
      zone_create: 1,
      zone_delete: 1,
      zone_delegate: 1,
      zonerecord_write: 1,
      zonerecord_create: 1,
      zonerecord_delete: 1,
      zonerecord_delegate: 1,
      user_write: 1,
      user_create: 1,
      user_delete: 1,
      nameserver_write: 1,
      nameserver_create: 1,
      nameserver_delete: 1,
      usable_ns: '4200',
    })
  }

  // No permissions for user 4201
  const limPerm = await Permission.get({ uid: U_LIMITED.id })
  if (limPerm) {
    await Permission.put({
      id: limPerm.id,
      self_write: 0,
      group_write: 0,
      group_create: 0,
      group_delete: 0,
      zone_write: 0,
      zone_create: 0,
      zone_delete: 0,
      zone_delegate: 0,
      zonerecord_write: 0,
      zonerecord_create: 0,
      zonerecord_delete: 0,
      zonerecord_delegate: 0,
      user_write: 0,
      user_create: 0,
      user_delete: 0,
      nameserver_write: 0,
      nameserver_create: 0,
      nameserver_delete: 0,
      usable_ns: '',
    })
  }

  await Zone.create(Z_INTREE)
  await Zone.create(Z_OUTSIDE)
  await ZoneRecord.create(ZR_INTREE)
  await ZoneRecord.create(ZR_INTREE_OTHER)
  await ZoneRecord.create(ZR_OUTSIDE)
  await Nameserver.create(NS)

  // Delegation: zone 4201 → group 4200, write=yes delete=no
  await Delegation.create({
    gid: 4200,
    oid: 4201,
    type: 'ZONE',
    perm_write: true,
    perm_delete: false,
    perm_delegate: true,
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
  await Delegation.delete({ gid: 4201, oid: 4200, type: 'ZONE' })
  await Delegation.delete({ gid: 4201, oid: 4201, type: 'ZONE' })
  await ZoneRecord.destroy({ id: ZR_DELEGATED_CREATE.id })
  await Nameserver.destroy({ id: NS.id })
  await ZoneRecord.destroy({ id: ZR_OUTSIDE.id })
  await ZoneRecord.destroy({ id: ZR_INTREE_OTHER.id })
  await ZoneRecord.destroy({ id: ZR_INTREE.id })
  await Zone.destroy({ id: Z_OUTSIDE.id })
  await Zone.destroy({ id: Z_INTREE.id })
  for (const u of [U_LIMITED, U_FULL]) {
    const p = await Permission.get({ uid: u.id })
    if (p) await Permission.destroy({ id: p.id })
    await User.destroy({ id: u.id })
  }
  const createdPerm = await Permission.get({ uid: U_CREATED.id })
  if (createdPerm) await Permission.destroy({ id: createdPerm.id })
  await User.destroy({ id: U_CREATED.id })
  for (const g of [G_CHILD, G_OUTSIDE, G_ROOT]) {
    await Group.destroy({ id: g.id })
  }
  await Mysql.execute('DELETE FROM nt_group_subgroups WHERE nt_subgroup_id IN (?, ?, ?)', [4200, 4201, 4202])
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

  it('GET /zone defaults to the caller group', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/zone',
      headers: authLimited.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(
      res.result.zone.map((z) => z.id),
      [Z_OUTSIDE.id],
    )
    assert.equal(res.result.meta.pagination.total, 1)
  })

  it('403 for GET /zone scoped outside the caller tree', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/zone?gid=${G_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
  })

  it('403 for zone logs scoped outside the caller tree', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/log/zone?gid=${G_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
  })

  it('403 for record logs on a zone outside the caller tree', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/log/zone_record?zid=${Z_INTREE.id}`,
      headers: authLimited.headers,
    })
    assert.equal(res.statusCode, 403)
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

  it('403 when moving a zone outside the caller tree', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${Z_INTREE.id}`,
      headers: authFull.headers,
      payload: { gid: G_OUTSIDE.id },
    })
    assert.equal(res.statusCode, 403)

    const [zone] = await Zone.get({ id: Z_INTREE.id })
    assert.equal(zone.gid, G_ROOT.id)
  })

  it('403 when a delegate moves the delegated zone into its own tree', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${Z_OUTSIDE.id}`,
      headers: authFull.headers,
      payload: { gid: G_ROOT.id },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /delegated/)

    const [zone] = await Zone.get({ id: Z_OUTSIDE.id })
    assert.equal(zone.gid, G_OUTSIDE.id)
  })

  it('200 when a delegate edits the delegated zone without moving it', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${Z_OUTSIDE.id}`,
      headers: authFull.headers,
      payload: { gid: G_OUTSIDE.id, ttl: 7200 },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.zone[0].gid, G_OUTSIDE.id)
  })

  it('rejects unknown zone fields before reaching the store', async () => {
    const [before] = await Zone.get({ id: Z_INTREE.id })
    const res = await server.inject({
      method: 'PUT',
      url: `/zone/${Z_INTREE.id}`,
      headers: authFull.headers,
      payload: { ttl: 7201, serial: 7, malicious: 'not-a-column' },
    })
    assert.equal(res.statusCode, 400)

    const [zone] = await Zone.get({ id: Z_INTREE.id })
    assert.equal(zone.ttl, before.ttl)
    assert.equal(zone.serial, before.serial)
  })

  it('403 for POST /zone when the requested id already exists', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/zone',
      headers: authFull.headers,
      payload: { ...Z_OUTSIDE, gid: G_ROOT.id },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /already exists/)
  })

  it('requires delete permission when PUT changes deleted state', async () => {
    const perm = await Permission.get({ uid: U_FULL.id })
    await Permission.put({ id: perm.id, zone_delete: false })
    try {
      const res = await server.inject({
        method: 'PUT',
        url: `/zone/${Z_INTREE.id}`,
        headers: authFull.headers,
        payload: { deleted: true },
      })
      assert.equal(res.statusCode, 403)
      assert.equal((await Zone.get({ id: Z_INTREE.id })).length, 1)
    } finally {
      await Permission.put({ id: perm.id, zone_delete: true })
    }
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
  it('403 when moving yourself to another group', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
      payload: { gid: G_CHILD.id },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /Cannot move yourself/)
    assert.equal((await User.get({ id: U_FULL.id }))[0].gid, G_ROOT.id)
  })

  it('rejects unknown fields before self-write reaches the store', async () => {
    const [before] = await User.get({ id: U_FULL.id })
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
      payload: { first_name: 'Rejected Full', malicious: 'not-a-column' },
    })
    assert.equal(res.statusCode, 400)
    assert.equal((await User.get({ id: U_FULL.id }))[0].first_name, before.first_name)
  })

  it('does not pass is_admin through self-write', async () => {
    const [before] = await User.get({ id: U_FULL.id })
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
      payload: {
        first_name: 'Still Full',
        is_admin: true,
      },
    })
    assert.equal(res.statusCode, 200)

    const [user] = await User.get({ id: U_FULL.id })
    assert.equal(user.gid, G_ROOT.id)
    assert.equal(user.is_admin, before.is_admin)
    assert.equal(user.first_name, 'Still Full')
  })

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

  it('does not allow user creation to set is_admin', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/user',
      headers: authFull.headers,
      payload: { ...U_CREATED, is_admin: true },
    })
    assert.equal(res.statusCode, 201)

    const [stored] = await User.get({ id: U_CREATED.id })
    assert.equal(stored.is_admin, false)
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
    assert.match(res.result.error_msg, /Not allowed to delete your own group/)
  })

  it('403 when moving a group beneath itself', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/group/${G_CHILD.id}`,
      headers: authFull.headers,
      payload: { parent_gid: G_CHILD.id },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /cannot contain itself/)
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

  it('403 for an unscoped zone record collection', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/zone_record',
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
  })

  it('403 when moving an in-tree record into a delegated zone without add permission', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone_record/${ZR_INTREE.id}`,
      headers: authFull.headers,
      payload: { zid: Z_OUTSIDE.id },
    })
    assert.equal(res.statusCode, 403)

    const [record] = await ZoneRecord.get({ id: ZR_INTREE.id })
    assert.equal(record.zid, Z_INTREE.id)
  })

  it('403 when moving a record out of a delegated zone without delete-record permission', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/zone_record/${ZR_OUTSIDE.id}`,
      headers: authFull.headers,
      payload: { zid: Z_INTREE.id },
    })
    assert.equal(res.statusCode, 403)

    const [record] = await ZoneRecord.get({ id: ZR_OUTSIDE.id })
    assert.equal(record.zid, Z_OUTSIDE.id)
  })

  it('moves a record between zones when both sides permit', async () => {
    await Delegation.put({
      gid: G_ROOT.id,
      oid: Z_OUTSIDE.id,
      type: 'ZONE',
      zone_perm_add_records: true,
      zone_perm_delete_records: true,
    })
    try {
      let res = await server.inject({
        method: 'PUT',
        url: `/zone_record/${ZR_INTREE_OTHER.id}`,
        headers: authFull.headers,
        payload: { zid: Z_OUTSIDE.id },
      })
      assert.equal(res.statusCode, 200)
      assert.equal((await ZoneRecord.get({ id: ZR_INTREE_OTHER.id }))[0].zid, Z_OUTSIDE.id)

      res = await server.inject({
        method: 'PUT',
        url: `/zone_record/${ZR_INTREE_OTHER.id}`,
        headers: authFull.headers,
        payload: { zid: Z_INTREE.id },
      })
      assert.equal(res.statusCode, 200)
      assert.equal((await ZoneRecord.get({ id: ZR_INTREE_OTHER.id }))[0].zid, Z_INTREE.id)
    } finally {
      await Delegation.put({
        gid: G_ROOT.id,
        oid: Z_OUTSIDE.id,
        type: 'ZONE',
        zone_perm_add_records: false,
        zone_perm_delete_records: false,
      })
    }
  })

  it('does not require create permission when an edit repeats the current zone id', async () => {
    const perm = await Permission.get({ uid: U_FULL.id })
    await Permission.put({ id: perm.id, zonerecord_create: false })
    try {
      const res = await server.inject({
        method: 'PUT',
        url: `/zone_record/${ZR_INTREE.id}`,
        headers: authFull.headers,
        payload: { zid: Z_INTREE.id, ttl: 3601 },
      })
      assert.equal(res.statusCode, 200)
    } finally {
      await Permission.put({ id: perm.id, zonerecord_create: true })
      await ZoneRecord.put({ id: ZR_INTREE.id, ttl: ZR_INTREE.ttl })
    }
  })

  it('enforces add/delete-record flags on a delegated zone', async () => {
    let res = await server.inject({
      method: 'POST',
      url: '/zone_record',
      headers: authFull.headers,
      payload: ZR_DELEGATED_CREATE,
    })
    assert.equal(res.statusCode, 403)

    await Delegation.put({
      gid: G_ROOT.id,
      oid: Z_OUTSIDE.id,
      type: 'ZONE',
      zone_perm_add_records: true,
      zone_perm_delete_records: true,
    })

    res = await server.inject({
      method: 'POST',
      url: '/zone_record',
      headers: authFull.headers,
      payload: ZR_DELEGATED_CREATE,
    })
    assert.equal(res.statusCode, 201)

    res = await server.inject({
      method: 'DELETE',
      url: `/zone_record/${ZR_DELEGATED_CREATE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)

    await Delegation.put({
      gid: G_ROOT.id,
      oid: Z_OUTSIDE.id,
      type: 'ZONE',
      zone_perm_add_records: false,
      zone_perm_delete_records: false,
    })
  })
})

describe('authz plugin - delegation routes', () => {
  it('creates a fail-closed delegation and records the authenticated actor', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/delegation',
      headers: authFull.headers,
      payload: {
        gid: G_CHILD.id,
        oid: Z_INTREE.id,
        type: 'ZONE',
        delegated_by_id: U_LIMITED.id,
        delegated_by_name: U_LIMITED.username,
      },
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.result.delegation.length, 1)
    assert.equal(res.result.delegation[0].delegate_write, 0)
    assert.equal(res.result.delegation[0].delegate_delete, 0)
    assert.equal(res.result.delegation[0].delegate_delegate, 0)
    assert.equal(res.result.delegation[0].delegated_by_id, U_FULL.id)
    assert.equal(res.result.delegation[0].delegated_by_name, U_FULL.username)
  })

  it('GET with gid and oid returns only that delegation', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/delegation?gid=${G_CHILD.id}&oid=${Z_INTREE.id}&type=ZONE`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.delegation.length, 1)
    assert.equal(res.result.delegation[0].nt_group_id, G_CHILD.id)
  })

  it('GET without a type reads zone delegations, as the store defaults', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/delegation?gid=${G_CHILD.id}&oid=${Z_INTREE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.delegation.length, 1)
    assert.equal(res.result.delegation[0].nt_group_id, G_CHILD.id)
  })

  it('returns 409 without creating a duplicate delegation', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/delegation',
      headers: authFull.headers,
      payload: { gid: G_CHILD.id, oid: Z_INTREE.id, type: 'ZONE' },
    })
    assert.equal(res.statusCode, 409)
    assert.equal((await Delegation.get({ gid: G_CHILD.id, oid: Z_INTREE.id, type: 'ZONE' })).length, 1)
  })

  it('updates an existing delegation', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/delegation',
      headers: authFull.headers,
      payload: { gid: G_CHILD.id, oid: Z_INTREE.id, type: 'ZONE', perm_write: true },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.delegation[0].delegate_write, 1)
  })

  it('returns 404 when updating a missing delegation', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/delegation',
      headers: authFull.headers,
      payload: {
        gid: G_CHILD.id,
        oid: ZR_INTREE_OTHER.id,
        type: 'ZONERECORD',
        perm_write: true,
      },
    })
    assert.equal(res.statusCode, 404)
  })

  it('deletes an existing delegation and returns 404 when repeated', async () => {
    const url = `/delegation?gid=${G_CHILD.id}&oid=${Z_INTREE.id}&type=ZONE`
    let res = await server.inject({ method: 'DELETE', url, headers: authFull.headers })
    assert.equal(res.statusCode, 200)
    assert.equal((await Delegation.get({ gid: G_CHILD.id, oid: Z_INTREE.id, type: 'ZONE' })).length, 0)

    res = await server.inject({ method: 'DELETE', url, headers: authFull.headers })
    assert.equal(res.statusCode, 404)
  })

  it(
    'creates one delegation when identical requests race',
    {
      skip: (process.env.NICTOOL_DATA_STORE ?? 'mysql') !== 'mysql',
    },
    async () => {
      const args = { gid: G_CHILD.id, oid: ZR_INTREE_OTHER.id, type: 'ZONERECORD' }
      await Delegation.delete(args)
      const results = await Promise.all([1, 2, 3].map(() => Delegation.create(args)))
      assert.equal(results.filter((r) => r.created).length, 1)
      assert.equal(results.filter((r) => r.duplicate).length, 2)
      const rows = await Delegation.get(args)
      assert.equal(rows.length, 1)
      await Delegation.delete(args)
    },
  )

  it('cannot delegate an object back to your own group', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/delegation',
      headers: authFull.headers,
      payload: { gid: G_ROOT.id, oid: Z_INTREE.id, type: 'ZONE' },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /own group/)
  })

  it('caps a re-delegation at the permissions on its source delegation', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/delegation',
      headers: authFull.headers,
      payload: {
        gid: G_CHILD.id,
        oid: Z_OUTSIDE.id,
        type: 'ZONE',
        perm_write: true,
        perm_delete: true,
        perm_delegate: true,
        zone_perm_add_records: true,
        zone_perm_delete_records: true,
      },
    })
    assert.equal(res.statusCode, 201)
    const [delegation] = res.result.delegation
    assert.equal(delegation.delegate_write, 1)
    assert.equal(delegation.delegate_delete, 1)
    assert.equal(delegation.delegate_delegate, 1)
    assert.equal(delegation.delegate_add_records, 0)
    assert.equal(delegation.delegate_delete_records, 0)
  })

  it('cannot edit a delegation when the source object is itself delegated', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/delegation',
      headers: authFull.headers,
      payload: {
        gid: G_CHILD.id,
        oid: Z_OUTSIDE.id,
        type: 'ZONE',
        perm_write: false,
      },
    })
    assert.equal(res.statusCode, 403)
  })

  it('perm_delete permits removal, never deletion of the delegated zone', async () => {
    await Delegation.put({
      gid: G_ROOT.id,
      oid: Z_OUTSIDE.id,
      type: 'ZONE',
      perm_delete: true,
    })
    const res = await server.inject({
      method: 'DELETE',
      url: `/zone/${Z_OUTSIDE.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 403)
    await Delegation.put({
      gid: G_ROOT.id,
      oid: Z_OUTSIDE.id,
      type: 'ZONE',
      perm_delete: false,
    })
  })
})

describe('authz plugin - create target resolution', () => {
  const G_PLANTED = 4212

  after(async () => {
    await Group.destroy({ id: G_PLANTED })
    await Mysql.execute('DELETE FROM nt_group_subgroups WHERE nt_subgroup_id = ?', [G_PLANTED])
  })

  it('authorizes the group a new group is actually filed under', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: authFull.headers,
      payload: {
        id: G_PLANTED,
        name: 'authz-planted',
        parent_gid: G_OUTSIDE.id,
      },
    })
    assert.equal(res.statusCode, 403)
    assert.equal((await Group.get({ id: G_PLANTED })).length, 0)
  })

  it('403 for POST /group with no parent group', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: authFull.headers,
      payload: { id: G_PLANTED, name: 'authz-rootless' },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /No target group/)
    assert.equal((await Group.get({ id: G_PLANTED })).length, 0)
  })

  it('201 for POST /group inside the caller tree', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/group',
      headers: authFull.headers,
      payload: { id: G_PLANTED, name: 'authz-planted', parent_gid: G_ROOT.id },
    })
    assert.equal(res.statusCode, 201)
    const [created] = await Group.get({ id: G_PLANTED })
    assert.equal(created.parent_gid, G_ROOT.id)
  })
})

describe('authz plugin - nameserver reads', () => {
  const NS_CHILD = {
    id: 4201,
    gid: G_CHILD.id,
    name: 'ns2.authz.example.com.',
    type: 'bind',
    ttl: 3600,
    address: '192.0.2.11',
    export: { interval: 0, serials: 0 },
  }

  before(async () => {
    await Nameserver.destroy({ id: NS_CHILD.id })
    await Nameserver.create(NS_CHILD)
  })

  after(async () => {
    await Nameserver.destroy({ id: NS_CHILD.id })
  })

  it('returns a subgroup nameserver fetched by id', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${NS_CHILD.id}`,
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver.length, 1)
    assert.equal(res.result.nameserver[0].id, NS_CHILD.id)
  })

  it('returns an active nameserver outside the caller tree', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/nameserver/${NS_CHILD.id}`,
      headers: authLimited.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.result.nameserver[0].id, NS_CHILD.id)
  })

  it('still scopes an unqualified collection to the caller group', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/nameserver',
      headers: authFull.headers,
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.result.nameserver.every((n) => n.gid === G_ROOT.id))
  })
})

describe('authz plugin - permission records', () => {
  it('PUT /permission/{id} stores the permissions it was given', async () => {
    const perm = await Permission.get({ gid: G_CHILD.id })
    assert.ok(perm, 'the child group has a permission row')

    const res = await server.inject({
      method: 'PUT',
      url: `/permission/${perm.id}`,
      headers: authFull.headers,
      payload: { zone: { create: true, write: true }, self_write: true },
    })
    assert.equal(res.statusCode, 200)

    const after = await Permission.get({ id: perm.id })
    assert.equal(after.zone.create, true)
    assert.equal(after.zone.write, true)
    assert.equal(after.self_write, true)
    // untouched fields survive a partial update
    assert.equal(after.gid ?? after.group.id, G_CHILD.id)

    await Permission.put({
      id: perm.id,
      zone_create: 0,
      zone_write: 0,
      self_write: 0,
    })
  })

  // an in-tree target, so the only thing that can deny is the gid mismatch
  const U_TARGET = {
    id: 4213,
    gid: G_CHILD.id,
    username: 'authz-permtarget',
    email: 'authz-permtarget@example.com',
    password: PASSWORD,
    first_name: 'Perm',
    last_name: 'Target',
    inherit_group_permissions: true,
  }

  // direct SQL: Permission.get throws when a crashed run left two rows behind
  const clearTarget = () => Mysql.execute('DELETE FROM nt_perm WHERE nt_user_id = ?', [U_TARGET.id])

  before(async () => {
    await clearTarget()
    await User.destroy({ id: U_TARGET.id })
    await User.create(U_TARGET)
  })

  after(async () => {
    await clearTarget()
    await User.destroy({ id: U_TARGET.id })
  })

  it('403 for a permission whose user and group disagree', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: authFull.headers,
      payload: {
        name: 'mismatched',
        user: { id: U_TARGET.id },
        group: { id: G_ROOT.id },
      },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /does not belong to that group/)
  })

  it('201 for a permission naming the target user own group', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/permission',
      headers: authFull.headers,
      payload: {
        name: 'matched',
        user: { id: U_TARGET.id },
        group: { id: G_CHILD.id },
      },
    })
    assert.equal(res.statusCode, 201)
  })

  it('does not grant a permission by switching another user to inheritance', async () => {
    const actorPerm = await Permission.get({ uid: U_FULL.id })
    const groupPerm = await Permission.get({ gid: G_CHILD.id })
    await Permission.put({ id: actorPerm.id, zone_delete: false })
    await Permission.put({ id: groupPerm.id, zone_delete: true })
    try {
      const res = await server.inject({
        method: 'PUT',
        url: `/user/${U_TARGET.id}`,
        headers: authFull.headers,
        payload: { inherit_group_permissions: true },
      })
      assert.equal(res.statusCode, 200)

      const explicit = await Permission.get({ uid: U_TARGET.id })
      assert.ok(explicit)
      assert.equal((await Permission.getEffective(U_TARGET.id)).zone.delete, false)
    } finally {
      await Permission.put({ id: actorPerm.id, zone_delete: true })
      await Permission.put({ id: groupPerm.id, zone_delete: false })
    }
  })

  it('does not revoke unmanaged permissions when creating an explicit row', async () => {
    const actorPerm = await Permission.get({ uid: U_FULL.id })
    const groupPerm = await Permission.get({ gid: G_CHILD.id })
    const explicit = await Permission.get({ uid: U_TARGET.id })
    if (explicit) await Permission.destroy({ id: explicit.id })
    await Permission.put({ id: actorPerm.id, zone_delete: false })
    await Permission.put({ id: groupPerm.id, zone_delete: true })
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/permission',
        headers: authFull.headers,
        payload: {
          name: 'preserved',
          inherit: false,
          user: { id: U_TARGET.id },
        },
      })
      assert.equal(res.statusCode, 201)
      assert.equal((await Permission.getEffective(U_TARGET.id)).zone.delete, true)
    } finally {
      await Permission.put({ id: actorPerm.id, zone_delete: true })
      await Permission.put({ id: groupPerm.id, zone_delete: false })
    }
  })
})

describe('authz plugin - delegation type and pseudo access', () => {
  it('refuses to delegate an object type with no permission cap', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/delegation',
      headers: authFull.headers,
      payload: {
        gid: G_CHILD.id,
        oid: NS.id,
        type: 'NAMESERVER',
        perm_write: true,
      },
    })
    assert.equal(res.statusCode, 403)
    assert.match(res.result.error_msg, /cannot be delegated/)
  })

  it('grants read on a zone holding a record delegated to the caller', async () => {
    // limited user's group has no access to zone 4200, only to one record in it
    await Delegation.create({
      gid: G_OUTSIDE.id,
      oid: ZR_INTREE.id,
      type: 'ZONERECORD',
      perm_write: false,
      perm_delete: false,
      perm_delegate: false,
    })
    try {
      const res = await server.inject({
        method: 'GET',
        url: `/zone/${Z_INTREE.id}`,
        headers: authLimited.headers,
      })
      assert.equal(res.statusCode, 200)

      const zones = await server.inject({
        method: 'GET',
        url: '/zone',
        headers: authLimited.headers,
      })
      assert.equal(zones.statusCode, 200)
      assert.deepEqual(
        zones.result.zone.map((zone) => zone.id).sort((a, b) => a - b),
        [Z_INTREE.id, Z_OUTSIDE.id],
      )

      const records = await server.inject({
        method: 'GET',
        url: `/zone_record?zid=${Z_INTREE.id}`,
        headers: authLimited.headers,
      })
      assert.equal(records.statusCode, 200)
      assert.deepEqual(
        records.result.zone_record.map((record) => record.id),
        [ZR_INTREE.id],
      )
      assert.equal(records.result.meta.pagination.total, 1)

      await Audit.logZoneRecord(U_FULL, 'modified', ZR_INTREE, Z_INTREE)
      await Audit.logZoneRecord(U_FULL, 'modified', ZR_INTREE_OTHER, Z_INTREE)
      const log = await server.inject({
        method: 'GET',
        url: `/log/zone_record?zid=${Z_INTREE.id}`,
        headers: authLimited.headers,
      })
      assert.equal(log.statusCode, 200)
      assert.ok(log.result.log.length > 0)
      assert.deepEqual(new Set(log.result.log.map((row) => row.zrid)), new Set([ZR_INTREE.id]))

      const write = await server.inject({
        method: 'PUT',
        url: `/zone/${Z_INTREE.id}`,
        headers: authLimited.headers,
        payload: { ttl: 7200 },
      })
      assert.equal(write.statusCode, 403)
    } finally {
      await Delegation.delete({
        gid: G_OUTSIDE.id,
        oid: ZR_INTREE.id,
        type: 'ZONERECORD',
      })
    }
  })
})

describe('authz plugin - deleted-state transitions', () => {
  it('does not require delete permission when deleted is unchanged', async () => {
    const perm = await Permission.get({ uid: U_FULL.id })
    await Permission.put({ id: perm.id, zone_delete: false })
    try {
      const res = await server.inject({
        method: 'PUT',
        url: `/zone/${Z_INTREE.id}`,
        headers: authFull.headers,
        payload: { deleted: false, ttl: 3600 },
      })
      assert.equal(res.statusCode, 200)
    } finally {
      await Permission.put({ id: perm.id, zone_delete: true })
    }
  })
})

describe('authz plugin - self permission inheritance', () => {
  it('ignores inherit_group_permissions on a self edit', async () => {
    const before = await Permission.get({ uid: U_FULL.id })
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
      payload: { inherit_group_permissions: true },
    })
    assert.equal(res.statusCode, 200)

    const after = await Permission.get({ uid: U_FULL.id })
    assert.ok(after, 'the explicit permission row survives')
    assert.equal(after.id, before.id)
  })

  it('strips permission fields from a self edit', async () => {
    const before = await Permission.get({ uid: U_FULL.id })
    const res = await server.inject({
      method: 'PUT',
      url: `/user/${U_FULL.id}`,
      headers: authFull.headers,
      payload: { first_name: 'Selfish', zone_write: false },
    })
    assert.equal(res.statusCode, 200)
    assert.equal((await User.get({ id: U_FULL.id }))[0].first_name, 'Selfish')

    const after = await Permission.get({ uid: U_FULL.id })
    assert.equal(after.zone.write, before.zone.write)
  })
})
