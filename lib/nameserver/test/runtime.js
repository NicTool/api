// The nameserver record carries the v3 runtime configuration the supervisor
// consumes (type, listen, publisher, transport, dnssec). It has to survive a
// round-trip through whichever store is active: nested structures in the file
// stores, JSON columns under MySQL, and `type` through the export_type_id
// foreign key.
import assert from 'node:assert/strict'
import { describe, it, after, before } from 'node:test'

import Nameserver from '../index.js'

const runtimeCase = {
  id: 4242,
  gid: 4096,
  name: 'rt.ns.example.com.',
  address: '1.2.3.9',
  ttl: 3600,
  export: { interval: 0, serials: true, status: '' },
  type: 'native',
  listen: [
    { address: '127.0.0.1', port: 5353, proto: 'udp' },
    { address: '127.0.0.1', port: 5353, proto: 'tcp' },
  ],
  publisher: { type: 'memory' },
  transport: { type: 'noop', interval: 0, cooldown: 5 },
  dnssec: { enabled: true, algorithm: 'ED25519', nsec3: false },
}

before(async () => {
  await Nameserver.destroy({ id: runtimeCase.id })
  await Nameserver.create(runtimeCase)
})

after(async () => {
  await Nameserver.destroy({ id: runtimeCase.id })
  await Nameserver.disconnect()
})

describe('nameserver runtime config', () => {
  it('round-trips listen sockets', async () => {
    const [ns] = await Nameserver.get({ id: runtimeCase.id })

    assert.deepEqual(ns.listen, runtimeCase.listen)
  })

  it('round-trips type, publisher, transport and dnssec', async () => {
    const [ns] = await Nameserver.get({ id: runtimeCase.id })

    assert.equal(ns.type, 'native')
    assert.deepEqual(ns.publisher, runtimeCase.publisher)
    assert.deepEqual(ns.transport, runtimeCase.transport)
    assert.deepEqual(ns.dnssec, runtimeCase.dnssec)
  })

  it('updates runtime config in place', async () => {
    const listen = [{ address: '127.0.0.1', port: 5354, proto: 'udp' }]
    assert.ok(await Nameserver.put({ id: runtimeCase.id, listen, type: 'bind' }))

    const [ns] = await Nameserver.get({ id: runtimeCase.id })
    assert.deepEqual(ns.listen, listen)
    assert.equal(ns.type, 'bind')
  })

  // dynect and bind-nsupdate are 2.x export types with no v3 nameserver. An
  // adopted record must still round-trip; refusing it would strand the record.
  it('stores a type nothing here can build', async () => {
    const legacy = { ...runtimeCase, id: 4244, name: 'dyn.ns.example.com.', type: 'dynect' }
    await Nameserver.destroy({ id: legacy.id })
    await Nameserver.create(legacy)

    const [ns] = await Nameserver.get({ id: legacy.id })
    assert.equal(ns.type, 'dynect')
    await Nameserver.destroy({ id: legacy.id })
  })

  it('omits runtime keys entirely for a legacy record that has none', async () => {
    const legacy = { ...runtimeCase, id: 4243, name: 'legacy.ns.example.com.' }
    for (const k of ['listen', 'publisher', 'transport', 'dnssec']) delete legacy[k]

    await Nameserver.destroy({ id: legacy.id })
    await Nameserver.create(legacy)
    const [ns] = await Nameserver.get({ id: legacy.id })

    for (const k of ['listen', 'publisher', 'transport', 'dnssec']) {
      assert.equal(ns[k], undefined, `${k} should be absent, not null`)
    }
    await Nameserver.destroy({ id: legacy.id })
  })
})
