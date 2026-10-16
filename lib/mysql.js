import mysql from 'mysql2/promise'

import Config from './config.js'

let _debug

function shapeRows(query, rows) {
  return /^(REPLACE|INSERT) INTO/.test(query) ? rows.insertId : rows
}

class Mysql {
  constructor() {
    if (Mysql._instance) return Mysql._instance
    Mysql._instance = this
    this.debug(Config.debug)
  }

  async connect() {
    this.dbh = await this.open()
    if (_debug) console.log(`MySQL connection id ${this.dbh.connection.connectionId}`)
    return this.dbh
  }

  async open() {
    const cfg = await Config.get('mysql')
    const connCfg = { ...cfg }

    // mysql2 no longer enables mysql_clear_password implicitly.
    // Retry once with explicit opt-in when the server requests it.
    if (connCfg.socketPath === '') delete connCfg.socketPath
    // if (_debug) console.log(connCfg)
    try {
      return await mysql.createConnection(connCfg)
    } catch (err) {
      if (err?.code !== 'MYSQL_CLEAR_PASSWORD_NOT_ENABLED') throw err
      return mysql.createConnection({ ...connCfg, enableCleartextPlugin: true })
    }
  }

  // A transaction gets its own connection so concurrent requests stay isolated.
  async transaction(fn) {
    const conn = await this.open()
    try {
      await conn.beginTransaction()
      const tx = {
        execute: async (query, paramsArray) => {
          const [rows] = await conn.execute(query, paramsArray ?? [])
          return shapeRows(query, rows)
        },
      }
      const result = await fn(tx)
      await conn.commit()
      return result
    } catch (err) {
      await conn.rollback().catch(() => {})
      throw err
    } finally {
      // GET_LOCK lives as long as the session, so a failed end must not leave it open
      await conn.end().catch(() => conn.destroy())
    }
  }

  async execute(query, paramsArray) {
    if (!this.dbh || this.dbh?.connection?._closing) {
      if (_debug) console.log(`(re)connecting to MySQL`)
      this.dbh = await this.connect()
    }

    if (_debug) console.log(query)
    if (_debug) console.log(paramsArray)
    const [rows, fields] = await this.dbh.execute(query, paramsArray)
    if (_debug) {
      if (fields) console.log(fields)
      console.log(rows)
    }

    return shapeRows(query, rows)
  }

  // Column names can come from payload keys, so they are quoted as
  // identifiers; values are always bound.
  insert(table, params = {}) {
    const columns = Object.keys(params).map(escapeId)
    return [
      `INSERT INTO ${table} (${columns.join(',')}) VALUES(${columns.map(() => '?')})`,
      Object.values(params),
    ]
  }

  select(query, params = {}) {
    return this.whereConditions(query, params)
  }

  // where is an object of column values, or SQL whose placeholders the
  // caller binds after the SET values
  update(table, where, params = {}) {
    const set = Object.keys(params).map((col) => `${escapeId(col)}=?`)
    const [conditions, whereValues] = typeof where === 'string' ? [where, []] : equalities(where)
    return [
      `UPDATE ${table} SET ${set.join(',')} WHERE ${conditions}`,
      [...Object.values(params), ...whereValues],
    ]
  }

  delete(table, params) {
    return this.whereConditions(`DELETE FROM ${table}`, params)
  }

  whereConditions(query, params) {
    if (Array.isArray(params)) return [query, [...params]]
    if (typeof params !== 'object' || Object.keys(params).length === 0) return [query, []]
    const [conditions, values] = equalities(params)
    return [`${query} WHERE ${conditions}`, values]
  }

  async disconnect(dbh) {
    const d = dbh || this.dbh
    if (!d) return
    // Forget the singleton handle first so a concurrent/second disconnect is a
    // no-op and the next execute() reconnects instead of reusing a dead handle.
    if (!dbh) this.dbh = null
    if (d.connection?._closing) return
    if (_debug) console.log(`MySQL connection id ${d.connection?.connectionId}`)
    await d.end()
  }

  debug(val) {
    if (val !== undefined) _debug = val
    return _debug
  }
}

const { escapeId } = mysql

function equalities(params) {
  const columns = Object.keys(params).map((col) => `${escapeId(col)}=?`)
  return [columns.join(' AND '), Object.values(params)]
}

export default new Mysql()
