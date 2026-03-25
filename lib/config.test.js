import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import Config from './config.js'

describe('config', () => {
  describe('get', () => {
    it(`loads mysql config`, async () => {
      const cfg = await Config.get('mysql')
      delete cfg.password; delete cfg.user
      assert.deepEqual(cfg, mysqlCfg)
    })

    it(`loads mysql config synchronously`, () => {
      const cfg = Config.getSync('mysql')
      delete cfg.password; delete cfg.user
    })

    it(`loads mysql config (from cache)`, async () => {
      process.env.NODE_DEBUG = 1
      const cfg = await Config.get('mysql')
      delete cfg.password; delete cfg.user
      assert.deepEqual(cfg, mysqlCfg)
      process.env.NODE_DEBUG = ''
    })

    it(`loads http config`, async () => {
      const cfg = await Config.get('http')
      const { tls, ...rest } = cfg
      delete rest.password
      assert.deepEqual(rest, httpCfg)
    })

    it(`loads http config synchronously`, () => {
      const cfg = Config.getSync('http')
      const { tls, ...rest } = cfg
      delete rest.password
      assert.deepEqual(rest, httpCfg)
    })

    it(`loads tls from conf.d/*.pem when present`, async () => {
      const cfg = await Config.get('http')
      delete cfg.password
      if (!cfg.tls) return // no PEM on this host — skip
      assert.match(cfg.tls.key, /-----BEGIN.*PRIVATE KEY-----/)
      assert.match(cfg.tls.cert, /-----BEGIN CERTIFICATE-----/)
    })

    it(`detects NODE_DEBUG env`, async () => {
      process.env.NODE_DEBUG = 1
      await Config.get('mysql')
      assert.equal(Config.debug, true)

      process.env.NODE_DEBUG = ''
      await Config.get('mysql')
      assert.equal(Config.debug, false)
    })
  })
})

const mysqlCfg = {
  host: '127.0.0.1',
  port: 3306,
  socketPath: '',
  database: 'nictool',
  timezone: '+00:00',
  dateStrings: ['DATETIME', 'TIMESTAMP'],
  decimalNumbers: true,
}

const httpCfg = {
  host: 'localhost',
  port: 3000,
  keepAlive: false,
  group: 'NicTool',
  jwt: {
    key: 'af1b926a5e21f535c4f5b6c42941c4cf',
  },
  cookie: {
    name: 'sid-nictool',
    ttl: 3600000,
    path: '/',
    clearInvalid: true,
    isSameSite: 'Strict',
    isSecure: true,
    isHttpOnly: false,
    password: '',
  },
}
