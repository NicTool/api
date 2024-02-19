const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const config = require('../lib/config')

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

    it(`loads session test config`, async function () {
      const cfg = await config.get('session', 'test')
      assert.deepEqual(cfg, sessCfg)
    })

    it(`loads session test config syncronously`, function () {
      const cfg = config.getSync('session', 'test')
      assert.deepEqual(cfg, sessCfg)
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
    isHttpOnly: true,
    isSameSite: 'Strict',
    isSecure: false,
    name: 'sid-nictool',
    password: '^NicTool.Is,The#Best_Dns-Manager$',
    path: '/'
  },
  keepAlive: false
}
