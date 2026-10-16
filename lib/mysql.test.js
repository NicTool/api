import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import Mysql from './mysql.js'

describe('mysql', () => {
  let dbh

  it('connects', async () => {
    dbh = await Mysql.connect()
    assert.ok(dbh.connection.connectionId)
  })

  if (process.env.NODE_ENV === 'cov') {
    it('is noisy when debug=true', async () => {
      Mysql.debug(true)
      await Mysql.execute(`SHOW DATABASES`)
      await Mysql.select(`SELECT * FROM nt_group`)
      Mysql.debug(false)
    })
  }

  it('formats SELECT queries', () => {
    assert.deepEqual(
      Mysql.select(`SELECT * FROM nt_user`, {
        last_name: 'Test',
      }),
      ['SELECT * FROM nt_user WHERE `last_name`=?', ['Test']],
    )
  })

  it('formats INSERT query', () => {
    const r = Mysql.insert(`nt_user`, {
      first_name: 'uNite',
      last_name: 'Test',
    })
    assert.deepEqual(r, ['INSERT INTO nt_user (`first_name`,`last_name`) VALUES(?,?)', ['uNite', 'Test']])
  })

  describe('update', () => {
    it('formats with one value', () => {
      const r = Mysql.update(
        `nt_user`,
        { nt_user_id: 4096 },
        {
          first_name: 'uNite',
        },
      )
      assert.deepEqual(r, ['UPDATE nt_user SET `first_name`=? WHERE `nt_user_id`=?', ['uNite', 4096]])
    })

    it('formats with two values', () => {
      const r = Mysql.update(
        `nt_user`,
        { nt_user_id: 4096 },
        {
          last_name: 'Teste',
          is_admin: 1,
        },
      )
      assert.deepEqual(r, [
        'UPDATE nt_user SET `last_name`=?,`is_admin`=? WHERE `nt_user_id`=?',
        ['Teste', 1, 4096],
      ])
    })

    it('formats with three values', () => {
      const r = Mysql.update(
        `nt_user`,
        { nt_user_id: 4096 },
        {
          first_name: 'Unit',
          last_name: 'Test',
          is_admin: 0,
        },
      )
      assert.deepEqual(r, [
        'UPDATE nt_user SET `first_name`=?,`last_name`=?,`is_admin`=? WHERE `nt_user_id`=?',
        ['Unit', 'Test', 0, 4096],
      ])
    })

    it('binds the SET values before a where clause the caller wrote', () => {
      const r = Mysql.update(`nt_user`, 'nt_user_id=? AND deleted=?', { first_name: 'Unit' })
      assert.deepEqual(r, ['UPDATE nt_user SET `first_name`=? WHERE nt_user_id=? AND deleted=?', ['Unit']])
    })

    it('quotes a column name that tries to be SQL', () => {
      const [sql] = Mysql.update(`nt_user`, { nt_user_id: 4096 }, { 'is_admin=1,first_name': 'x' })
      assert.equal(sql, 'UPDATE nt_user SET `is_admin=1,first_name`=? WHERE `nt_user_id`=?')
    })
  })

  describe('insert', () => {
    it('quotes a column name that tries to be SQL', () => {
      const [sql] = Mysql.insert(`nt_user`, { 'first_name) VALUES (1); --': 'x' })
      assert.equal(sql, 'INSERT INTO nt_user (`first_name) VALUES (1); --`) VALUES(?)')
    })
  })

  describe('delete', () => {
    it('no params', () => {
      assert.deepEqual(Mysql.delete(`nt_user`, {}), [`DELETE FROM nt_user`, []])
    })

    it('with params', () => {
      assert.deepEqual(Mysql.delete(`nt_user`, { last_name: 'Test' }), [
        'DELETE FROM nt_user WHERE `last_name`=?',
        ['Test'],
      ])
    })
  })

  it('executes formatted queries', async () => {
    const [query, argsArray] = Mysql.select(`SELECT * FROM nt_options`)
    const r = await Mysql.execute(query, argsArray)
    assert.deepEqual(r[0].option_id, 1)

    // await Mysql.execute(...Mysql.select(`SELECT * FROM nt_options`))
  })

  it('disconnects', async () => {
    assert.ok(dbh.connection.connectionId)
    await Mysql.disconnect(dbh)
  })
})
