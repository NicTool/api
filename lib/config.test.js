const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const config = require('./config')

describe('config', function () {
  describe('get', function () {
    it(`loads mysql test config`, async function () {
      const cfg = await config.get('mysql', 'test')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql test config syncronously`, function () {
      const cfg = config.getSync('mysql', 'test')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql cov config`, async function () {
      const cfg = await config.get('mysql', 'cov')
      assert.deepEqual(cfg, mysqlTestCfg)
    })

    it(`loads mysql cov config (from cache)`, async function () {
      process.env.NODE_DEBUG = 1
      const cfg = await config.get('mysql', 'cov')
      assert.deepEqual(cfg, mysqlTestCfg)
      process.env.NODE_DEBUG = ''
    })

    it(`loads session test config`, async function () {
      const cfg = await config.get('session', 'test')
      assert.deepEqual(cfg, sessCfg)
    })

    it(`loads session test config syncronously`, function () {
      const cfg = config.getSync('session', 'test')
      assert.deepEqual(cfg, sessCfg)
    })

    it(`loads http test config syncronously`, function () {
      const cfg = config.getSync('http', 'test')
      assert.deepEqual(cfg, httpCfg)
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
