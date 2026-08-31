import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after, beforeEach } from 'node:test'

import GroupRepoFile from '../group/store/file.js'
import FileStore, { nextId, resolveCodec } from './file.js'

const envKeys = ['NICTOOL_DATA_STORE', 'NICTOOL_DATA_STORE_PATH', 'NICTOOL_CONF_DIR']

describe('file store', () => {
  const savedEnv = {}
  let tmp

  it('allocates after the highest existing id', () => {
    assert.equal(nextId([]), 1)
    assert.equal(nextId([{ id: 9 }, { id: 2 }, {}]), 10)
    assert.equal(nextId([{ id: 9 }], 12), 13)
    assert.throws(() => nextId([{ id: 0xffffffff }]), /id space exhausted/)
  })

  before(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-filestore-'))
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key]
    // NICTOOL_CONF_DIR points somewhere without an api.json, so storeConfig
    // resolves purely from the env vars each test sets.
    process.env.NICTOOL_CONF_DIR = path.join(tmp, 'no-such-conf')
    process.env.NICTOOL_DATA_STORE_PATH = tmp
  })

  it(`writes .json for a json store and .toml for a toml store`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    await new FileStore('zone').save('zone', [{ id: 1 }])
    assert.equal(fs.existsSync(path.join(tmp, 'zone.json')), true)

    process.env.NICTOOL_DATA_STORE = 'toml'
    await new FileStore('zone').save('zone', [{ id: 1 }])
    assert.equal(fs.existsSync(path.join(tmp, 'zone.toml')), true)
  })

  it(`round-trips rows through the json codec`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    const store = new FileStore('rt')

    await store.save('rt', [{ id: 1, zone: 'example.com', deleted: false }])

    assert.deepEqual(await store.load('rt'), [{ id: 1, zone: 'example.com', deleted: false }])
  })

  it(`preserves null through json, which TOML cannot`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    const jsonStore = new FileStore('nulls')
    await jsonStore.save('nulls', [{ id: 1, last_publish: null }])

    const [jsonRow] = await jsonStore.load('nulls')
    assert.equal(jsonRow.last_publish, null, 'json keeps the null')

    process.env.NICTOOL_DATA_STORE = 'toml'
    const tomlStore = new FileStore('nulls')
    await tomlStore.save('nulls', [{ id: 1, last_publish: null }])

    const [tomlRow] = await tomlStore.load('nulls')
    assert.equal(tomlRow.last_publish, undefined, 'toml drops it — hence the repair in the zone store')
  })

  it(`returns an empty list when the file does not exist`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    assert.deepEqual(await new FileStore('absent').load('absent'), [])
  })

  it(`returns an empty list when the key is missing or not an array`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    fs.writeFileSync(path.join(tmp, 'odd.json'), JSON.stringify({ odd: 'not-an-array' }))

    assert.deepEqual(await new FileStore('odd').load('odd'), [])
  })

  it(`creates missing parent directories on save`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    process.env.NICTOOL_DATA_STORE_PATH = path.join(tmp, 'deep', 'nested')

    await new FileStore('zone').save('zone', [{ id: 1 }])

    assert.equal(fs.existsSync(path.join(tmp, 'deep', 'nested', 'zone.json')), true)
  })

  it(`fails loudly rather than writing inside the package when no path is set`, async () => {
    process.env.NICTOOL_DATA_STORE = 'json'
    delete process.env.NICTOOL_DATA_STORE_PATH

    await assert.rejects(() => new FileStore('zone').load('zone'), /no path is configured/)
  })

  it(`defaults to the json codec for an unrecognized type`, () => {
    process.env.NICTOOL_DATA_STORE = 'nonsense'
    assert.equal(resolveCodec().ext, 'json')
  })

  for (const type of ['json', 'toml']) {
    it(`serializes ${type} id allocation and does not reuse a destroyed id`, async () => {
      process.env.NICTOOL_DATA_STORE = type
      const store = new GroupRepoFile()
      const ids = await Promise.all(
        Array.from({ length: 20 }, (_, index) => store.create({ name: `group-${index}.example` })),
      )

      assert.deepEqual(
        [...ids].sort((a, b) => a - b),
        Array.from({ length: 20 }, (_, index) => index + 1),
      )
      await store.destroy({ id: 20 })
      assert.equal(await store.create({ name: 'after-destroy.example' }), 21)
    })
  }
})
