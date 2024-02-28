import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import Config from './config.js'

describe('config', () => {
  describe('get', () => {
    it(`loads mysql test config`, async () => {
      const cfg = await Config.get('mysql', 'test')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql test config syncronously`, () => {
      const cfg = Config.getSync('mysql', 'test')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql cov config`, async () => {
      const cfg = await Config.get('mysql', 'cov')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql cov config (from cache)`, async () => {
      process.env.NODE_DEBUG = 1
      const cfg = await Config.get('mysql', 'cov')
      assert.deepEqual(cfg, mysqlTestCfg)
      process.env.NODE_DEBUG = ''
    })

    it(`loads session test config`, async () => {
      const cfg = await Config.get('session', 'test')
      assert.deepEqual(cfg, sessCfg)
    })

    it(`loads session test config syncronously`, () => {
      const cfg = Config.getSync('session', 'test')
      assert.deepEqual(cfg, sessCfg)
    })

    it(`loads http test config syncronously`, () => {
      const cfg = Config.getSync('http', 'test')
      assert.deepEqual(cfg, httpCfg)
    })

    it(`detects NODE_DEBUG env`, async () => {
      process.env.NODE_DEBUG=1
      let cfg = await Config.get('mysql', 'test')
      assert.equal(Config.debug, true)

      process.env.NODE_DEBUG=''
      cfg = await Config.get('mysql', 'test')
      assert.equal(Config.debug, false)

      cfg = await Config.get('mysql', 'test')
      assert.equal(cfg.user, 'root')
    })
  })
})

const mysqlTestCfg = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'root',
  database: 'nictool',
  timezone: '+00:00',
  dateStrings: ['DATETIME', 'TIMESTAMP'],
  decimalNumbers: true,
}

const sessCfg = {
  cookie: {
    clearInvalid: true,
    isHttpOnly: true,
    isSameSite: 'Strict',
    isSecure: false,
    name: 'sid-nictool',
    password: '^NicTool.Is,The#Best_Dns-Manager$',
    path: '/',
    ttl: 3600000,
  },
  keepAlive: false,
}

const httpCfg = {
  host: 'localhost',
  port: 3000,
}
