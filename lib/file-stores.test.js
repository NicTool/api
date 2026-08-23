import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { after, before, describe, it } from 'node:test'

import Config from './config.js'

// Exercises the json file backends directly. The mysql behavior of these
// subsystems is covered by the mysql-backend suite; this covers the parity
// story that keeps a file-store deployment working.
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
  it('creates, lists, updates, and deletes a delegation', async () => {
    const FileDelegation = new (await freshStores().then(([d]) => d.default))
    const created = await FileDelegation.create({
      gid: 42, oid: 7, type: 'ZONE', perm_write: true, delegated_by_id: 2,
    })
    assert.ok(created.created)

    assert.ok((await FileDelegation.create({ gid: 42, oid: 7, type: 'ZONE' })).duplicate)

    let rows = await FileDelegation.getDelegated(42, 'ZONE')
    assert.equal(rows.length, 0) // zone 7 does not exist in the empty entity files

    const delegates = await FileDelegation.getDelegates(7, 'ZONE')
    assert.equal(delegates[0].delegate_write, 1)

    assert.ok(await FileDelegation.put({ gid: 42, oid: 7, type: 'ZONE', perm_write: false }))
    assert.equal((await FileDelegation.getDelegates(7, 'ZONE'))[0].delegate_write, 0)

    assert.ok(await FileDelegation.delete({ gid: 42, oid: 7, type: 'ZONE' }))
    assert.equal(await FileDelegation.put({ gid: 42, oid: 7, type: 'ZONE' }), null)
    assert.deepEqual(await FileDelegation.getDelegates(7, 'ZONE'), [])
  })
})

describe('file-store audit', () => {
  it('records and lists entries with search, sort, and pagination', async () => {
    const FileAudit = new (await freshStores().then(([, a]) => a.default))
    // the global listing resolves actors through the user file
    await seedEntity('user', [{
      id: 5, gid: 3, username: 'auditor', first_name: 'Audie', last_name: 'Tor',
    }])
    const actor = { id: 5 }
    const zone = {
      id: 9, gid: 3, zone: 'audit.test.', mailaddr: 'hm.audit.test.',
      serial: 1, ttl: 3600,
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

    const global = await FileAudit.listGlobal({ gids: [3] })
    assert.equal(global.total, 2)
    assert.equal(global.rows[0].description, 'modified zone')
  })

  it('rejects an unscoped listing', async () => {
    const FileAudit = new (await freshStores().then(([, a]) => a.default))
    assert.equal((await FileAudit.listZones({ gids: [] })).total, 0)
  })
})

describe('file-store authz', () => {
  it('resolves object groups and group trees', async () => {
    const FileAuthz = new (await freshStores().then(([, , z]) => z.default))
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

  it('honors delegations for record access', async () => {
    const FileAuthz = new (await freshStores().then(([, , z]) => z.default))
    const FileDelegation = new (await freshStores().then(([d]) => d.default))

    await seedEntity('group', [{ id: 50, name: 'holder' }, { id: 51, name: 'owner' }])
    await seedEntity('zone', [{ id: 60, gid: 51, zone: 'del.test.' }])
    await seedEntity('zone_record', [{ id: 61, zid: 60, owner: 'a.del.test.' }])
    await FileDelegation.create({
      gid: 50, oid: 61, type: 'ZONERECORD',
      perm_write: true, zone_perm_add_records: true,
    })
    // a delegation on the zone itself surfaces when acting on its records
    await FileDelegation.create({
      gid: 50, oid: 60, type: 'ZONE', perm_write: true,
    })

    assert.deepEqual(await FileAuthz.delegatedRecordIdsInZone(50, 60), [61])
    assert.deepEqual(await FileAuthz.getDelegatedZoneIds([50]), [60])
    const pseudo = await FileAuthz.zonePseudoDelegation(50, 60)
    assert.equal(pseudo.pseudo, 1)
    const viaRecord = await FileAuthz.zoneDelegationForRecord(50, 61)
    assert.equal(viaRecord.pseudo, 1)
    assert.equal(viaRecord.perm_write, 1)
  })
})

async function seedEntity(name, rows) {
  const { default: FileStore } = await import('./store/file.js')
  await new FileStore(name).save(name, rows)
}
