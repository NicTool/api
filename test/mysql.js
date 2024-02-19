const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const mysql = require('../lib/mysql')

describe('mysql', () => {
  it('connects', async () => {
    this.dbh = await mysql.connect()
    assert.ok(this.dbh.connection.connectionId)
  })

  if (process.env.NODE_ENV === 'cov') {
    it('is noisy when debug=true', async () => {
      mysql.debug(true)
      await mysql.execute(`SHOW DATABASES`)
      await mysql.select(`SELECT * FROM nt_group`)
    })
  }

  it('disconnects', async () => {
    assert.ok(this.dbh.connection.connectionId)
    await mysql.disconnect(this.dbh)
  })
})
