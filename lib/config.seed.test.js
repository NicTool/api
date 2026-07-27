import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after } from 'node:test'

import Config from './config.js'

describe('config seeding', () => {
  const cwd = process.cwd()
  let tmp

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-conf-'))
    process.chdir(tmp)
    Config.cfg = {}
  })

  after(() => {
    process.chdir(cwd)
    fs.rmSync(tmp, { recursive: true, force: true })
    Config.cfg = {}
  })

  it(`creates conf.d and seeds api.json when absent`, async () => {
    assert.equal(fs.existsSync(path.join(tmp, 'conf.d')), false)

    const cfg = await Config.get('http')

    assert.equal(fs.existsSync(path.join(tmp, 'conf.d', 'api.json')), true)
    assert.equal(cfg.host, 'localhost')
    assert.equal(cfg.port, 3000)
  })

  it(`mints secrets rather than shipping a shared default`, () => {
    const seeded = JSON.parse(fs.readFileSync(path.join(tmp, 'conf.d', 'api.json'), 'utf8'))

    assert.match(seeded.http.jwt.key, /^[0-9a-f]{32}$/)
    assert.notEqual(seeded.http.jwt.key, 'af1b926a5e21f535c4f5b6c42941c4cf')
    assert.ok(seeded.http.cookie.password.length >= 32)
  })

  it(`leaves an existing conf.d alone`, async () => {
    const file = path.join(tmp, 'conf.d', 'api.json')
    const before = fs.readFileSync(file, 'utf8')

    Config.cfg = {}
    await Config.get('http')

    assert.equal(fs.readFileSync(file, 'utf8'), before)
  })

  it(`seeds no store, so a missing mysql config still throws`, async () => {
    Config.cfg = {}
    await assert.rejects(() => Config.get('mysql'), { code: 'ENOENT' })
  })
})
