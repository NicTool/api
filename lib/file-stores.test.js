import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { after, before, describe, it } from 'node:test'

import Config from './config.js'

// The mysql side of these subsystems is covered by the mysql-backend suite;
// this is the file-store half.
const saved = {
  storeType: process.env.NICTOOL_DATA_STORE,
  storePath: process.env.NICTOOL_DATA_STORE_PATH,
}

function freshStores() {
  return Promise.all([
    import('./delegation/store/file.js'),
    import('./audit/store/file.js'),
    import('./authz/store/file.js'),
  ])
}

before(() => {
  process.env.NICTOOL_DATA_STORE = 'json'
  process.env.NICTOOL_DATA_STORE_PATH = mkdtempSync(`${tmpdir()}/nt-file-stores-`)
  delete Config.cfg.store
})

after(() => {
  rmSync(process.env.NICTOOL_DATA_STORE_PATH, { recursive: true, force: true })
  if (saved.storeType === undefined) delete process.env.NICTOOL_DATA_STORE
  else process.env.NICTOOL_DATA_STORE = saved.storeType
  if (saved.storePath === undefined) delete process.env.NICTOOL_DATA_STORE_PATH
  else process.env.NICTOOL_DATA_STORE_PATH = saved.storePath
})

describe('file-store delegation', () => {
  it('creates one delegation when identical requests race', async () => {
    const FileDelegation = new (await freshStores().then(([d]) => d.default))()
    const args = { gid: 42, oid: 8, type: 'ZONE' }
    const results = await Promise.all([1, 2, 3].map(() => FileDelegation.create(args)))
    assert.equal(results.filter((r) => r.created).length, 1)
    assert.equal(results.filter((r) => r.duplicate).length, 2)
    assert.ok(await FileDelegation.delete(args))
  })

  it('creates, lists, updates, and deletes a delegation', async () => {
    const FileDelegation = new (await freshStores().then(([d]) => d.default))()
    await seedEntity('group', [{ id: 42, name: 'delegate holder' }])
    const created = await FileDelegation.create({
      gid: 42,
      oid: 7,
      type: 'ZONE',
      perm_write: true,
      delegated_by_id: 2,
    })
    assert.ok(created.created)

    assert.ok((await FileDelegation.create({ gid: 42, oid: 7, type: 'ZONE' })).duplicate)

    let rows = await FileDelegation.getDelegated(42, 'ZONE')
    assert.equal(rows.length, 0) // zone 7 does not exist in the empty entity files

    const delegates = await FileDelegation.getDelegates(7, 'ZONE')
    assert.equal(delegates[0].delegate_write, 1)

    assert.ok(await FileDelegation.put({ gid: 42, oid: 7, type: 'ZONE', perm_write: false }))
    assert.equal((await FileDelegation.getDelegates(7, 'ZONE'))[0].delegate_write, 0)

    assert.ok(
      await FileDelegation.delete({
        gid: 42,
        oid: 7,
        type: 'ZONE',
        delegated_by_id: 9,
        delegated_by_name: 'deleting user',
      }),
    )
    assert.equal(await FileDelegation.put({ gid: 42, oid: 7, type: 'ZONE' }), null)
    assert.deepEqual(await FileDelegation.getDelegates(7, 'ZONE'), [])

    const { default: FileStore } = await import('./store/file.js')
    const logs = await new FileStore('delegate_log').load('delegate_log')
    assert.deepEqual(
      { uid: logs.at(-1).nt_user_id, name: logs.at(-1).nt_user_name },
      { uid: 9, name: 'deleting user' },
    )
  })
})

describe('file-store audit', () => {
  it('records and lists entries with search, sort, and pagination', async () => {
    const FileAudit = new (await freshStores().then(([, a]) => a.default))()
    // the global listing resolves actors through the user file
    await seedEntity('user', [
      {
        id: 5,
        gid: 3,
        username: 'auditor',
        first_name: 'Audie',
        last_name: 'Tor',
      },
    ])
    const actor = { id: 5 }
    const zone = {
      id: 9,
      gid: 3,
      zone: 'audit.test.',
      mailaddr: 'hm.audit.test.',
      serial: 1,
      ttl: 3600,
    }

    await FileAudit.logZone(actor, 'added', zone)
    await FileAudit.logZone(actor, 'modified', { ...zone, serial: 2 }, { gid: 1 })

    const list = await FileAudit.listZones({ gids: [3] })
    assert.equal(list.total, 2)
    assert.equal(list.rows[0].action, 'modified') // default sort: newest first

    assert.equal(list.rows[0].user, 'Audie Tor (auditor)')

    const paged = await FileAudit.listZones({ gids: [3], limit: 1, offset: 1 })
    assert.equal(paged.rows.length, 1)
    assert.equal(paged.rows[0].action, 'added')

    const searched = await FileAudit.listZones({ gids: [3], search: 'MODIF' })
    assert.equal(searched.filtered, 1)

    const exact = await FileAudit.listZones({ gids: [3], search: 'modified', exact_match: true })
    assert.equal(exact.filtered, 1)

    const partialExact = await FileAudit.listZones({ gids: [3], search: 'mod', exact_match: true })
    assert.equal(partialExact.filtered, 0)

    const global = await FileAudit.listGlobal({ gids: [3] })
    assert.equal(global.total, 2)
    assert.equal(global.rows[0].description, 'modified zone')
  })

  it('rejects an unscoped listing', async () => {
    const FileAudit = new (await freshStores().then(([, a]) => a.default))()
    assert.equal((await FileAudit.listZones({ gids: [] })).total, 0)
  })
})

describe('file-store authz', () => {
  it('resolves object groups and group trees', async () => {
    const FileAuthz = new (await freshStores().then(([, , z]) => z.default))()
    await seedEntity('group', [
      { id: 1, name: 'root' },
      { id: 10, name: 'parent', parent_gid: 1 },
      { id: 11, name: 'child', parent_gid: 10 },
    ])
    await seedEntity('zone', [{ id: 20, gid: 11, zone: 'z.test.' }])
    await seedEntity('user', [{ id: 30, gid: 10, username: 'u', first_name: 'U', last_name: 'One' }])

    assert.equal(await FileAuthz.getObjectGroupId('zone', 20), 11)
    assert.equal(await FileAuthz.isInGroupTree(10, 11), true)
    assert.equal(await FileAuthz.isInGroupTree(11, 10), false)
    assert.equal(await FileAuthz.isActiveGroup(10), true)
    assert.equal(await FileAuthz.isActiveObject('user', 30), true)
    assert.equal(await FileAuthz.getObjectGroupId('zone', 999), null)
  })

  it('uses the persisted session and permission shapes', async () => {
    const FileAuthz = new (await freshStores().then(([, , z]) => z.default))()
    await seedEntity('group', [
      { id: 10, name: 'parent', permissions: { id: 10 } },
      { id: 11, name: 'deleted-owner', parent_gid: 10 },
    ])
    await seedEntity('user', [{ id: 30, gid: 10, username: 'u', permissions: { id: 30 } }])
    await seedEntity('session', [{ id: 40, uid: 30, last_access: 2_000_000_000 }])
    await seedEntity('zone', [{ id: 50, gid: 11, zone: 'deleted.test.', deleted: true }])

    assert.equal(await FileAuthz.liveSessionGroup(30, 40, 1_000_000_000), 10)
    assert.deepEqual(await FileAuthz.permissionRecord(30), {
      uid: 30,
      gid: 10,
      target_gid: 10,
    })
    assert.equal(await FileAuthz.getObjectGroupId('zone', 50), 11)
  })

  it('honors delegations for record access', async () => {
    const FileAuthz = new (await freshStores().then(([, , z]) => z.default))()
    const FileDelegation = new (await freshStores().then(([d]) => d.default))()

    await seedEntity('group', [
      { id: 50, name: 'holder' },
      { id: 51, name: 'owner' },
    ])
    await seedEntity('zone', [{ id: 60, gid: 51, zone: 'del.test.' }])
    await seedEntity('zone_record', [{ id: 61, zid: 60, owner: 'a.del.test.' }])
    await FileDelegation.create({
      gid: 50,
      oid: 61,
      type: 'ZONERECORD',
      perm_write: true,
      zone_perm_add_records: true,
    })
    // a delegation on the zone itself surfaces when acting on its records
    await FileDelegation.create({
      gid: 50,
      oid: 60,
      type: 'ZONE',
      perm_write: true,
    })

    assert.deepEqual(await FileAuthz.delegatedRecordIdsInZone(50, 60), [61])
    assert.deepEqual(await FileAuthz.getDelegatedZoneIds([50]), [60])
    const pseudo = await FileAuthz.zonePseudoDelegation(50, 60)
    assert.equal(pseudo.pseudo, 1)
    const viaRecord = await FileAuthz.zoneDelegationForRecord(50, 61)
    assert.equal(viaRecord.pseudo, 1)
    assert.equal(viaRecord.perm_write, 1)
  })

  it('applies delegated collection scopes', async () => {
    const { default: FileZone } = await import('./zone/store/file.js')
    const { default: FileZoneRecord } = await import('./zone_record/store/file.js')
    const zones = new FileZone()
    const records = new FileZoneRecord()

    await seedEntity('zone', [
      { id: 60, gid: 50, zone: 'owned.test.' },
      { id: 61, gid: 51, zone: 'delegated.test.' },
      { id: 62, gid: 51, zone: 'hidden.test.' },
    ])
    await seedEntity('zone_record', [
      { id: 70, zid: 61, owner: 'allowed.delegated.test.' },
      { id: 71, zid: 61, owner: 'hidden.delegated.test.' },
    ])

    assert.deepEqual(
      (await zones.get({ gid: 50, accessible_ids: [61] })).map((z) => z.id),
      [61, 60],
    )
    assert.equal(await zones.count({ gid: 50, accessible_ids: [61] }), 2)
    assert.deepEqual(
      (await records.get({ zid: 61, ids: [70] })).map((r) => r.id),
      [70],
    )
    assert.equal(await records.count({ zid: 61, ids: [70] }), 1)
    assert.deepEqual(await records.get({ zid: 61, ids: [] }), [])
    assert.equal(await records.count({ zid: 61, ids: [] }), 0)
  })
})

async function seedEntity(name, rows) {
  const { default: FileStore } = await import('./store/file.js')
  await new FileStore(name).save(name, rows)
}
