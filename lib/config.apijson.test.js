import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after, beforeEach } from 'node:test'

import Config, { storeConfig } from './config.js'

const storeEnvKeys = ['NICTOOL_DATA_STORE', 'NICTOOL_DATA_STORE_PATH', 'NICTOOL_DATA_STORE_DSN']

describe('api.json config', () => {
  let tmp
  const savedEnv = {}

  before(() => {
    for (const key of [...storeEnvKeys, 'NICTOOL_CONF_DIR']) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-apijson-'))
    process.env.NICTOOL_CONF_DIR = tmp
  })

  after(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) process.env[key] = val
      else delete process.env[key]
    }
    fs.rmSync(tmp, { recursive: true, force: true })
    Config.cfg = {}
  })

  beforeEach(() => {
    Config.cfg = {}
    for (const key of storeEnvKeys) delete process.env[key]
  })

  const writeApiJson = (obj) => fs.writeFileSync(path.join(tmp, 'api.json'), JSON.stringify(obj, null, 2))

  it(`reads sections from NICTOOL_CONF_DIR/api.json`, async () => {
    writeApiJson({ http: { host: '10.0.0.1', port: 8080, group: 'Ops' } })

    const cfg = await Config.get('http')

    assert.equal(cfg.host, '10.0.0.1')
    assert.equal(cfg.port, 8080)
    assert.equal(cfg.group, 'Ops')
  })

  it(`does not seed over an existing http section`, async () => {
    writeApiJson({ http: { host: 'kept', port: 1234 } })

    await Config.get('http')

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'api.json'), 'utf8'))
    assert.equal(onDisk.http.host, 'kept')
    assert.equal(onDisk.http.jwt, undefined)
  })

  it(`mints http secrets into a drop-in api.json that carries only a store`, async () => {
    writeApiJson({ store: { type: 'json', path: '/var/lib/nictool' } })

    const cfg = await Config.get('http')

    assert.match(cfg.jwt.key, /^[0-9a-f]{32}$/)

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'api.json'), 'utf8'))
    assert.deepEqual(onDisk.store, { type: 'json', path: '/var/lib/nictool' })
    assert.ok(onDisk.http.cookie.password.length >= 32)
  })

  it(`derives the mysql section from a mysql store`, async () => {
    writeApiJson({
      store: { type: 'mysql', host: 'db.example.com', port: 3307, user: 'nt', database: 'ntdb' },
    })

    const cfg = await Config.get('mysql')

    assert.equal(cfg.host, 'db.example.com')
    assert.equal(cfg.port, 3307)
    assert.equal(cfg.database, 'ntdb')
    assert.equal(cfg.timezone, '+00:00', 'mysql2 defaults are merged in')
    assert.equal(cfg.type, undefined, 'store-only keys are not leaked to mysql2')
  })

  it(`prefers an explicit mysql section over the derived one`, async () => {
    writeApiJson({
      store: { type: 'mysql', host: 'derived' },
      mysql: { host: 'explicit', database: 'nictool' },
    })

    assert.equal((await Config.get('mysql')).host, 'explicit')
  })

  it(`does not derive mysql from a file store`, async () => {
    writeApiJson({ store: { type: 'json', path: '/var/lib/nictool' } })

    await assert.rejects(() => Config.get('mysql'), { code: 'ENOENT' })
  })

  it(`storeConfig reads the store section`, () => {
    writeApiJson({ store: { type: 'json', path: '/var/lib/nictool' } })

    assert.deepEqual(storeConfig(), { type: 'json', path: '/var/lib/nictool' })
  })

  it(`storeConfig lets env override api.json`, () => {
    writeApiJson({ store: { type: 'json', path: '/from/file' } })
    process.env.NICTOOL_DATA_STORE = 'toml'
    process.env.NICTOOL_DATA_STORE_PATH = '/from/env'

    assert.deepEqual(storeConfig(), { type: 'toml', path: '/from/env' })
  })

  it(`storeConfig returns empty when nothing is configured`, () => {
    fs.rmSync(path.join(tmp, 'api.json'), { force: true })

    assert.deepEqual(storeConfig(), {})
  })
})
