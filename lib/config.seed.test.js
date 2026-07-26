// Seeding reads and writes ./conf.d relative to cwd, so this suite chdirs into
// a scratch dir. node --test runs each file in its own process, keeping that
// away from the suites that load the real conf.d.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after } from 'node:test'

import { parse } from 'smol-toml'

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

  it(`creates conf.d and seeds http.toml when absent`, async () => {
    assert.equal(fs.existsSync(path.join(tmp, 'conf.d')), false)

    const cfg = await Config.get('http')

    assert.equal(fs.existsSync(path.join(tmp, 'conf.d', 'http.toml')), true)
    assert.equal(cfg.host, 'localhost')
    assert.equal(cfg.port, 3000)
  })

  it(`mints secrets rather than shipping a shared default`, () => {
    const seeded = parse(fs.readFileSync(path.join(tmp, 'conf.d', 'http.toml'), 'utf8'))

    assert.match(seeded.jwt.key, /^[0-9a-f]{32}$/)
    // the key that leaked in the published 3.0.1 tarball
    assert.notEqual(seeded.jwt.key, 'af1b926a5e21f535c4f5b6c42941c4cf')
    // @hapi/cookie rejects anything shorter than 32 characters
    assert.ok(seeded.cookie.password.length >= 32)
  })

  it(`leaves an existing conf.d alone`, async () => {
    const file = path.join(tmp, 'conf.d', 'http.toml')
    const before = fs.readFileSync(file, 'utf8')

    Config.cfg = {}
    await Config.get('http')

    assert.equal(fs.readFileSync(file, 'utf8'), before)
  })

  it(`seeds only http.toml, so a missing mysql.toml still throws`, async () => {
    Config.cfg = {}
    await assert.rejects(() => Config.get('mysql'), { code: 'ENOENT' })
  })
})
