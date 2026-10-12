import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after } from 'node:test'

import FileStore from '../../store/file.js'
import ZoneRepoFile from './file.js'

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
    await new FileStore('zone').save('zone', [{ id: 1, zone: 'example.com' }])
    await new FileStore('nameserver').save('nameserver', [{ id: 5, name: 'ns1.example.net.', ttl: 3600 }])
    await new FileStore('zone_nameserver').save('zone_nameserver', [
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
