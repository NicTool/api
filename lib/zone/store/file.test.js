import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after } from 'node:test'

import FileStore from '../../store/file.js'
import ZoneRepoFile from './file.js'
import { seed } from '../../../test/seed.js'

const envKeys = ['NICTOOL_DATA_STORE', 'NICTOOL_DATA_STORE_PATH', 'NICTOOL_CONF_DIR']

describe('zone file store nameservers', () => {
  const savedEnv = {}
  let tmp

  before(async () => {
    for (const key of envKeys) savedEnv[key] = process.env[key]
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-zone-ns-'))
    process.env.NICTOOL_CONF_DIR = path.join(tmp, 'no-such-conf')
    process.env.NICTOOL_DATA_STORE = 'json'
    process.env.NICTOOL_DATA_STORE_PATH = tmp
    await seed(new FileStore('zone'), 'zone', [{ id: 1, zone: 'example.com' }])
    await seed(new FileStore('nameserver'), 'nameserver', [{ id: 5, name: 'ns1.example.net.', ttl: 3600 }])
    await seed(new FileStore('zone_nameserver'), 'zone_nameserver', [
      { zid: 1, nid: 5 },
      { zid: 2, nid: 5 },
    ])
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('lists the nameservers assigned to a zone', async () => {
    assert.deepEqual(await new ZoneRepoFile().nameserversFor(1), [
      { zone: 'example.com', name: 'ns1.example.net.', ttl: 3600 },
    ])
  })

  it('ignores assignments left behind by a destroyed zone', async () => {
    assert.deepEqual(await new ZoneRepoFile().nameserversFor(2), [])
  })
})

describe('zone file store names', () => {
  const savedEnv = {}
  let tmp
  let Zone

  before(async () => {
    for (const key of envKeys) savedEnv[key] = process.env[key]
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-zone-name-'))
    process.env.NICTOOL_CONF_DIR = path.join(tmp, 'no-such-conf')
    process.env.NICTOOL_DATA_STORE = 'json'
    process.env.NICTOOL_DATA_STORE_PATH = tmp
    await seed(new FileStore('zone'), 'zone', [{ id: 10, gid: 1, zone: 'Legacy.Example.COM.' }])
    Zone = (await import('../index.js')).default
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('matches a name stored before names were canonical', async () => {
    assert.equal((await Zone.get({ zone: 'legacy.example.com' }))[0]?.id, 10)
    assert.equal(await Zone.count({ zone: 'LEGACY.example.com.' }), 1)
  })

  it('refuses a second live zone beside it', async () => {
    await assert.rejects(Zone.create({ gid: 1, zone: 'legacy.example.com' }), /already exists/)
  })
})
