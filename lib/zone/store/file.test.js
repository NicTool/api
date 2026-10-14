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
    await seed(new FileStore('zone'), 'zone', [
      { id: 1, zone: 'example.com', nameservers: [7, 5, 6, 9] },
      { id: 2, zone: 'example.net' },
    ])
    await seed(new FileStore('nameserver'), 'nameserver', [
      { id: 5, name: 'ns1.example.net.', ttl: 3600 },
      { id: 6, name: 'ns0.example.net.', ttl: 3600, deleted: true },
      { id: 7, name: 'ns2.example.net.', ttl: 7200 },
    ])
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('lists the active assigned nameservers, lowest id first', async () => {
    assert.deepEqual(await new ZoneRepoFile().nameserversFor(1), [
      { zone: 'example.com', name: 'ns1.example.net.', ttl: 3600 },
      { zone: 'example.com', name: 'ns2.example.net.', ttl: 7200 },
    ])
  })

  it('lists none for a zone without assignments', async () => {
    assert.deepEqual(await new ZoneRepoFile().nameserversFor(2), [])
  })

  it('lists none for a missing zone', async () => {
    assert.deepEqual(await new ZoneRepoFile().nameserversFor(3), [])
  })
})
