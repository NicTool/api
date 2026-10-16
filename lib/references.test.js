import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { storeType } from './config.js'
import cascades from './references.js'

import Group from './group/index.js'
import Nameserver from './nameserver/index.js'
import Session from './session/index.js'
import User from './user/index.js'
import Zone from './zone/index.js'
import ZoneRecord from './zone_record/index.js'

const GID = 47101
const ids = {
  group: [47101, 47111, 47121],
  user: [47102, 47112, 47122],
  zone: [47103, 47113, 47123],
  nameserver: [47104, 47114, 47124],
  session: [47105, 47115, 47125],
  zone_record: [47106, 47116, 47126],
}

const entities = {
  group: { store: Group, body: (id) => ({ id, parent_gid: 0, name: `g${id}.refgraph.test` }) },
  user: {
    store: User,
    body: (id) => ({
      id,
      gid: GID,
      username: `refgraph${id}`,
      email: `refgraph${id}@example.com`,
      password: 'Wh@tA-Decent#P6ssw0rd',
      first_name: 'Ref',
      last_name: 'Graph',
      is_admin: false,
    }),
  },
  zone: {
    store: Zone,
    body: (id) => ({
      id,
      gid: GID,
      zone: `z${id}.refgraph.test`,
      mailaddr: `hostmaster.z${id}.refgraph.test.`,
      serial: 1,
      refresh: 1,
      retry: 2,
      expire: 3,
      minimum: 4,
      ttl: 3600,
    }),
  },
  nameserver: {
    store: Nameserver,
    body: (id) => ({ id, name: `ns${id}.refgraph.test.`, address: '203.0.113.10', type: 'nsd', ttl: 3600 }),
  },
  session: { store: Session, body: (id) => ({ id, session: `refgraph-${id}`, last_access: 1700000000 }) },
  zone_record: {
    store: ZoneRecord,
    body: (id) => ({ id, owner: `r${id}.refgraph.test.`, type: 'A', address: '203.0.113.9', ttl: 3600 }),
  },
}

const softDeletes = (name) => typeof entities[name].store.destroy === 'function'
const rows = (found) => [found].flat().filter(Boolean).length

async function present(name, id) {
  const { store } = entities[name]
  if (!softDeletes(name)) return rows(await store.get({ id }))
  let n = 0
  for (const deleted of [false, true]) n += rows(await store.get({ id, deleted }))
  return n
}

async function remove(name, id) {
  const { store } = entities[name]
  return softDeletes(name) ? store.destroy({ id }) : store.delete({ id })
}

// A store may allocate its own id, so seed() reports the one it used.
async function seed(name, body) {
  const returned = await entities[name].store.create(body)
  return Number.isInteger(returned) ? returned : body.id
}

async function reset() {
  for (const uid of ids.user) await Session.delete({ uid })
  for (const name of ['zone_record', 'session', 'zone', 'nameserver', 'user', 'group']) {
    for (const id of ids[name]) await remove(name, id)
  }
}

before(reset)

after(async () => {
  await reset()
  for (const { store } of Object.values(entities)) await store.disconnect?.()
})

describe('cascade graph', () => {
  it('declares the edges the constraints enforce', () => {
    assert.deepEqual(
      cascades.map((e) => `${e.parent} -> ${e.child}`).sort(),
      ['group -> nameserver', 'user -> session', 'zone -> zone_record'],
      'an edge was added or dropped; the file stores follow this list',
    )
    for (const edge of cascades) {
      assert.ok(entities[edge.parent], `no fixture for parent ${edge.parent}`)
      assert.ok(entities[edge.child], `no fixture for child ${edge.child}`)
      assert.ok(edge.via, `${edge.parent} -> ${edge.child} declares no via`)
    }
  })

  for (const edge of cascades) {
    it(`destroying a ${edge.parent} takes its ${edge.child} rows (${edge.via})`, async () => {
      await reset()
      await seed('group', entities.group.body(GID))

      const [doomed, spared] = ids[edge.parent]
      if (edge.parent === 'group') await seed('group', entities.group.body(spared))
      else for (const id of [doomed, spared]) await seed(edge.parent, entities[edge.parent].body(id))

      const [first, other, extra] = ids[edge.child]
      const child = await seed(edge.child, { ...entities[edge.child].body(first), [edge.via]: doomed })
      const sibling = await seed(edge.child, { ...entities[edge.child].body(extra), [edge.via]: doomed })
      const control = await seed(edge.child, { ...entities[edge.child].body(other), [edge.via]: spared })

      if (softDeletes(edge.child)) await entities[edge.child].store.delete({ id: sibling })

      for (const [id, what] of [
        [child, 'child'],
        [sibling, 'sibling'],
        [control, 'control'],
      ]) {
        assert.equal(await present(edge.child, id), 1, `the ${what} did not seed`)
      }

      assert.ok(await remove(edge.parent, doomed), `destroying the ${edge.parent} reported no change`)
      assert.equal(await present(edge.parent, doomed), 0, `the ${edge.parent} outlived its own destroy`)

      assert.equal(await present(edge.child, child), 0, `the ${edge.child} outlived its ${edge.parent}`)
      assert.equal(await present(edge.child, sibling), 0, `a soft-deleted ${edge.child} was left behind`)
      assert.equal(await present(edge.child, control), 1, `an unrelated ${edge.child} was taken too`)

      // mysql reads a session through its user, so a surviving row would read
      // as absent. Deleting it again reports whether it is really gone.
      for (const id of [child, sibling]) {
        assert.equal(await remove(edge.child, id), false, `a ${edge.child} row was still there to delete`)
      }
    })
  }

  it('leaves the parent in place when a cascade fails', async () => {
    await reset()
    await seed('group', entities.group.body(GID))
    const zid = ids.zone[0]
    await seed('zone', entities.zone.body(zid))
    const rec = await seed('zone_record', { ...entities.zone_record.body(ids.zone_record[0]), zid })

    if (storeType() === 'mysql') {
      assert.ok(await Zone.destroy({ id: zid }), 'the zone did not destroy')
      assert.equal(await present('zone_record', rec), 0, 'the constraint left the record')
      return
    }

    const original = ZoneRecord.get.bind(ZoneRecord)
    ZoneRecord.get = async () => {
      throw new Error('cascade probe')
    }
    try {
      await assert.rejects(() => Zone.destroy({ id: zid }), /cascade probe/)
    } finally {
      ZoneRecord.get = original
    }

    assert.equal(await present('zone', zid), 1, 'the zone went while its records stayed')
    assert.ok(await Zone.destroy({ id: zid }), 'the retry found no zone to destroy')
    assert.equal(await present('zone_record', rec), 0, 'the record outlived the retry')
  })
})
