const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const config = require('../lib/config')

describe('config', function () {
  describe('get', function () {
    it(`loads mysql test config`, async function () {
      const cfg = await config.get('mysql', 'test')
      assert.deepEqual(cfg, mysqlCfg)
    })

    it(`loads mysql test config syncronously`, function () {
      const cfg = config.getSync('mysql', 'test')
      assert.deepEqual(cfg, mysqlCfg)
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

const mysqlCfg = {
  host: '127.0.0.1',
  port: 3306,
  user: 'nictool',
  password: 'NicToolTesting',
  database: 'nictool',
  timezone: '+00:00',
  dateStrings: ['DATETIME', 'TIMESTAMP'],
  decimalNumbers: true,
}

const sessCfg = {
  cookie: {
    httpOnly: false,
    maxAge: 86400000,
    path: '/',
    sameSite: 'Strict',
  },
  name: 'sessionId',
  resave: false,
  saveUninitialized: false,
  secret: 'nictoolisthebestdnsmanager',
}
