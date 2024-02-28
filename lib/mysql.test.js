import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import Mysql from './mysql.js'
const mysql = new Mysql()

describe('mysql', () => {
  let dbh

  it('connects', async () => {
    dbh = await mysql.connect()
    assert.ok(dbh.connection.connectionId)
  })

  if (process.env.NODE_ENV === 'cov') {
    it('is noisy when debug=true', async () => {
      mysql.debug(true)
      await mysql.execute(`SHOW DATABASES`)
      await mysql.select(`SELECT * FROM nt_group`)
      mysql.debug(false)
    })
  }

  it('SQL: formats SELECT queries', async () => {
    const r = await mysql.select(`SELECT * FROM nt_user WHERE`, {
      last_name: 'Test',
      skipExecute: true,
    })
    assert.equal(r, `SELECT * FROM nt_user WHERE last_name=?`)
  })

  it('SQL: formats INSERT queries', async () => {
    const r = await mysql.select(`INSERT INTO nt_user SET`, {
      first_name: 'uNite',
      last_name: 'Test',
      skipExecute: true,
    })
    assert.equal(r, `INSERT INTO nt_user SET first_name=? AND last_name=?`)
  })

  it('SQL: formats UPDATE queries, 1', async () => {
    const { q, p } = await mysql.update(
      `UPDATE nt_user SET`,
      `WHERE nt_user_id=4096`,
      { first_name: 'uNite', skipExecute: true },
    )
    assert.equal(q, `UPDATE nt_user SET first_name=? WHERE nt_user_id=4096`)
    assert.deepEqual(p, ['uNite'])
  })

  it('SQL: formats UPDATE queries, 2', async () => {
    const { q, p } = await mysql.update(
      `UPDATE nt_user SET`,
      `WHERE nt_user_id=4096`,
      { last_name: 'Teste', is_admin: 1, skipExecute: true },
    )
    assert.equal(
      q,
      `UPDATE nt_user SET last_name=?,is_admin=? WHERE nt_user_id=4096`,
    )
    assert.deepEqual(p, ['Teste', 1])
  })

  it('SQL: formats UPDATE queries, 3', async () => {
    const { q, p } = await mysql.update(
      `UPDATE nt_user SET`,
      `WHERE nt_user_id=4096`,
      { first_name: 'Unit', last_name: 'Test', is_admin: 0, skipExecute: true },
    )
    assert.equal(
      q,
      `UPDATE nt_user SET first_name=?,last_name=?,is_admin=? WHERE nt_user_id=4096`,
    )
    assert.deepEqual(p, ['Unit', 'Test', 0])
  })

  it('disconnects', async () => {
    assert.ok(dbh.connection.connectionId)
    await mysql.disconnect(dbh)
  })
})
