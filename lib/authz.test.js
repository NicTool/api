import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Group from './group/index.js'
import User from './user/index.js'
import Zone from './zone.js'
import ZoneRecord from './zone_record.js'
import Nameserver from './nameserver.js'
import Permission from './permission.js'
import Delegation from './delegation.js'
import Authz from './authz.js'
import Mysql from './mysql.js'

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

const U_FULL = {
  id: 4200,
  gid: 4200,
  username: 'authz-full',
  email: 'authz-full@example.com',
  password: 'Wh@tA-Decent#P6ssw0rd',
  first_name: 'Full',
  last_name: 'Perm',
  inherit_group_permissions: false,
}
const U_LIMITED = {
  id: 4201,
  gid: 4202,
  username: 'authz-limited',
  email: 'authz-limited@example.com',
  password: 'Wh@tA-Decent#P6ssw0rd',
  first_name: 'Limited',
  last_name: 'Perm',
  inherit_group_permissions: false,
}
const U_NOSELF = {
  id: 4202,
  gid: 4200,
  username: 'authz-noself',
  email: 'authz-noself@example.com',
  password: 'Wh@tA-Decent#P6ssw0rd',
  first_name: 'No',
  last_name: 'Self',
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
const ZR_PSEUDO = {
  id: 4201,
  zid: 4201,
  owner: 'test.authz-out.example.com.',
  type: 'A',
  address: '192.0.2.2',
  ttl: 3600,
}
const ZR_DIRECT = {
  id: 4202,
  zid: 4201,
  owner: 'direct.authz-out.example.com.',
  type: 'A',
  address: '192.0.2.3',
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

// Credentials objects matching JWT shape
const credsFull = { user: { id: 4200 }, group: { id: 4200 } }
const credsLimited = { user: { id: 4201 }, group: { id: 4202 } }
const credsNoself = { user: { id: 4202 }, group: { id: 4200 } }

before(async () => {
  // Clean up stale data from prior crashed runs
  for (const d of [
    { gid: 4200, oid: 4202, type: 'ZONERECORD' },
    { gid: 4200, oid: 4201, type: 'ZONE' },
  ]) {
    try { await Delegation.delete(d) } catch { /* ignore */ }
  }
  for (const id of [4200, 4201, 4202]) {
    await ZoneRecord.destroy({ id })
  }
  for (const id of [4200, 4201]) await Zone.destroy({ id })
  await Nameserver.destroy({ id: 4200 })
  for (const id of [4200, 4201, 4202]) {
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
  for (const u of [U_FULL, U_LIMITED, U_NOSELF]) await User.create(u)

  // Set permissions for full-perm user
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

  // Set permissions for limited user — all false (defaults)
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

  // Set permissions for noself user — has resource perms but no self_write
  const noselfPerm = await Permission.get({ uid: U_NOSELF.id })
  if (noselfPerm) {
    await Permission.put({
      id: noselfPerm.id,
      self_write: 0,
      zone_write: 1, zone_create: 1, zone_delete: 1, zone_delegate: 1,
      zonerecord_write: 1, zonerecord_create: 1, zonerecord_delete: 1,
      zonerecord_delegate: 1,
      user_write: 1, user_create: 1, user_delete: 1,
    })
  }

  // Create zones, zone records, nameserver
  await Zone.create(Z_INTREE)
  await Zone.create(Z_OUTSIDE)
  await ZoneRecord.create(ZR_INTREE)
  await ZoneRecord.create(ZR_PSEUDO)
  await ZoneRecord.create(ZR_DIRECT)
  await Nameserver.create(NS)

  // Create delegations
  await Delegation.create({
    gid: 4200, oid: 4201, type: 'ZONE',
    perm_write: true, perm_delete: false, perm_delegate: true,
  })
  await Delegation.create({
    gid: 4200, oid: 4202, type: 'ZONERECORD',
    perm_write: true, perm_delete: false, perm_delegate: false,
  })
})

after(async () => {
  // Teardown in reverse dependency order
  await Delegation.delete({ gid: 4200, oid: 4202, type: 'ZONERECORD' })
  await Delegation.delete({ gid: 4200, oid: 4201, type: 'ZONE' })
  await Nameserver.destroy({ id: NS.id })
  await ZoneRecord.destroy({ id: ZR_DIRECT.id })
  await ZoneRecord.destroy({ id: ZR_PSEUDO.id })
  await ZoneRecord.destroy({ id: ZR_INTREE.id })
  await Zone.destroy({ id: Z_OUTSIDE.id })
  await Zone.destroy({ id: Z_INTREE.id })
  for (const u of [U_NOSELF, U_LIMITED, U_FULL]) {
    const p = await Permission.get({ uid: u.id })
    if (p) await Permission.destroy({ id: p.id })
    await User.destroy({ id: u.id })
  }
  for (const g of [G_CHILD, G_OUTSIDE, G_ROOT]) {
    await Group.destroy({ id: g.id })
  }
  // Clean up subgroup entries
  await Mysql.execute(
    'DELETE FROM nt_group_subgroups WHERE nt_subgroup_id IN (?, ?, ?)',
    [4200, 4201, 4202],
  )
  await Mysql.disconnect()
})

describe('checkPermission', () => {
  describe('create actions', () => {
    it('allows create when user has permission', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'create', undefined,
      )
      assert.equal(r.allowed, true)
    })

    it('allows create into child group', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'create', undefined,
        { targetGroupId: 4201 },
      )
      assert.equal(r.allowed, true)
    })

    it('denies create when user lacks permission', async () => {
      const r = await Authz.checkPermission(
        credsLimited, 'zone', 'create', undefined,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /Not allowed to create/)
    })

    it('denies create when target group not in tree', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'create', undefined,
        { targetGroupId: 4202 },
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /No Access Allowed/)
    })
  })

  describe('self-user restrictions', () => {
    it('denies delete self', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'user', 'delete', 4200,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /Not allowed to delete self/)
    })

    it('allows write self when self_write=true', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'user', 'write', 4200,
      )
      assert.equal(r.allowed, true)
    })

    it('denies write self when self_write=false', async () => {
      const r = await Authz.checkPermission(
        credsNoself, 'user', 'write', 4202,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /Not allowed to modify self/)
    })

    it('allows read self', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'user', 'read', 4200,
      )
      assert.equal(r.allowed, true)
    })
  })

  describe('own-group restrictions', () => {
    it('denies write to own group', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'group', 'write', 4200,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /Not allowed to edit your own group/)
    })

    it('denies delete own group', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'group', 'delete', 4200,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /Not allowed to delete your own group/)
    })
  })

  describe('nameserver usable list', () => {
    it('allows read of usable nameserver', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'nameserver', 'read', 4200,
      )
      assert.equal(r.allowed, true)
    })
  })

  describe('group tree ownership', () => {
    it('allows read of in-tree zone', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'read', 4200,
      )
      assert.equal(r.allowed, true)
    })

    it('allows write of in-tree zone with permission', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'write', 4200,
      )
      assert.equal(r.allowed, true)
    })

    it('denies write when user lacks action permission', async () => {
      const r = await Authz.checkPermission(
        credsLimited, 'zone', 'write', 4201,
      )
      assert.equal(r.allowed, false)
    })
  })

  describe('delegation access', () => {
    it('allows read of delegated zone', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'read', 4201,
      )
      assert.equal(r.allowed, true)
    })

    it('allows write of delegated zone when perm_write=1', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'write', 4201,
      )
      assert.equal(r.allowed, true)
    })

    it('denies delete of delegated zone when perm_delete=0', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'delete', 4201,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /no 'delete' permission/)
    })

    it('allows delegate action when perm_delegate=1', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'delegate', 4201,
      )
      assert.equal(r.allowed, true)
    })
  })

  describe('pseudo-delegation (zone record via parent zone)', () => {
    it('allows read of zone record in delegated zone', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zonerecord', 'read', 4201,
      )
      assert.equal(r.allowed, true)
    })
  })

  describe('direct zone record delegation', () => {
    it('allows read of directly delegated zone record', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zonerecord', 'read', 4202,
      )
      assert.equal(r.allowed, true)
    })

    it('denies delete when perm_delete=0', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zonerecord', 'delete', 4202,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /no 'delete' permission/)
    })
  })

  describe('deny fallthrough', () => {
    it('denies access to object not in tree and not delegated', async () => {
      const r = await Authz.checkPermission(
        credsLimited, 'zone', 'read', 4200,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /No Access Allowed/)
    })

    it('denies when object does not exist', async () => {
      const r = await Authz.checkPermission(
        credsFull, 'zone', 'read', 99999,
      )
      assert.equal(r.allowed, false)
      assert.match(r.msg, /No Access Allowed/)
    })
  })
})

describe('getObjectGroupId', () => {
  it('returns group id for zone', async () => {
    assert.equal(await Authz.getObjectGroupId('zone', 4200), 4200)
  })

  it('returns group id for zonerecord via join', async () => {
    assert.equal(await Authz.getObjectGroupId('zonerecord', 4200), 4200)
  })

  it('returns group id for user', async () => {
    assert.equal(await Authz.getObjectGroupId('user', 4200), 4200)
  })

  it('returns group id for nameserver', async () => {
    assert.equal(await Authz.getObjectGroupId('nameserver', 4200), 4200)
  })

  it('returns parent_group_id for group', async () => {
    assert.equal(await Authz.getObjectGroupId('group', 4201), 4200)
  })

  it('returns 1 for root group', async () => {
    assert.equal(await Authz.getObjectGroupId('group', 4200), 1)
  })

  it('returns null for unknown resource type', async () => {
    assert.equal(await Authz.getObjectGroupId('bogus', 4200), null)
  })

  it('returns null for nonexistent object', async () => {
    assert.equal(await Authz.getObjectGroupId('zone', 99999), null)
  })
})

describe('isInGroupTree', () => {
  it('returns true for same group', async () => {
    assert.equal(await Authz.isInGroupTree(4200, 4200), true)
  })

  it('returns true for child group', async () => {
    assert.equal(await Authz.isInGroupTree(4200, 4201), true)
  })

  it('returns false for unrelated group', async () => {
    assert.equal(await Authz.isInGroupTree(4200, 4202), false)
  })

  it('returns false for parent from child perspective', async () => {
    assert.equal(await Authz.isInGroupTree(4201, 4200), false)
  })
})

describe('getDelegateAccess', () => {
  it('returns delegation row for directly delegated zone', async () => {
    const d = await Authz.getDelegateAccess(4200, 4201, 'zone')
    assert.ok(d)
    assert.equal(d.perm_write, 1)
    assert.equal(d.perm_delete, 0)
  })

  it('returns null for non-delegated zone', async () => {
    const d = await Authz.getDelegateAccess(4202, 4200, 'zone')
    assert.equal(d, null)
  })

  it('returns pseudo-delegation for zone record via parent zone', async () => {
    const d = await Authz.getDelegateAccess(4200, 4201, 'zonerecord')
    assert.ok(d)
    assert.equal(d.pseudo, 1)
  })

  it('returns direct delegation for zone record', async () => {
    const d = await Authz.getDelegateAccess(4200, 4202, 'zonerecord')
    assert.ok(d)
    assert.equal(d.perm_write, 1)
    assert.equal(d.perm_delete, 0)
  })

  it('returns null for unknown resource type', async () => {
    const d = await Authz.getDelegateAccess(4200, 4200, 'bogus')
    assert.equal(d, null)
  })
})

describe('capPermissions', () => {
  it('removes fields user lacks permission for', () => {
    const userPerm = {
      zone: { create: true, write: false, delete: true },
      user: { create: false },
    }
    const target = {
      zone_create: 1,
      zone_write: 1,
      zone_delete: 1,
      user_create: 1,
    }
    const capped = Authz.capPermissions(userPerm, target)
    assert.equal(capped.zone_create, 1)
    assert.equal(capped.zone_write, undefined)
    assert.equal(capped.zone_delete, 1)
    assert.equal(capped.user_create, undefined)
  })

  it('returns null/undefined inputs as-is', () => {
    assert.equal(Authz.capPermissions({}, null), null)
    assert.equal(Authz.capPermissions({}, undefined), undefined)
  })
})
