const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const mysql = require('../lib/mysql')

process.env.NODE_ENV = 'test'

describe('mysql', () => {
  it('connects', async () => {
    this.dbh = await mysql.connect()
    assert.ok(this.dbh.connection.connectionId)
  })

  it('disconnects', async () => {
    assert.ok(this.dbh.connection.connectionId)
    await mysql.disconnect(this.dbh)
  })
})
