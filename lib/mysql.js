import mysql from 'mysql2/promise'

import Config from './config.js'

let _debug

class Mysql {
  constructor() {
    if (Mysql._instance) return Mysql._instance
    Mysql._instance = this
    this.debug(Config.debug)
  }

  async connect() {
    const cfg = await Config.get('mysql')
    const connCfg = { ...cfg }

    // mysql2 no longer enables mysql_clear_password implicitly.
    // Retry once with explicit opt-in when the server requests it.
    if (connCfg.socketPath === '') delete connCfg.socketPath
    // if (_debug) console.log(connCfg)
    try {
      this.dbh = await mysql.createConnection(connCfg)
    } catch (err) {
      if (err?.code !== 'MYSQL_CLEAR_PASSWORD_NOT_ENABLED') throw err
      this.dbh = await mysql.createConnection({ ...connCfg, enableCleartextPlugin: true })
    }
    if (_debug) console.log(`MySQL connection id ${this.dbh.connection.connectionId}`)
    return this.dbh
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

    if (/^(REPLACE|INSERT) INTO/.test(query)) return rows.insertId

    return rows
  }

  insert(table, params = {}) {
    return [
      `INSERT INTO ${table} (${Object.keys(params).join(',')}) VALUES(${Object.keys(params).map(() => '?')})`,
      Object.values(params),
    ]
  }

  select(query, params = {}) {
    return this.whereConditions(query, params)
  }

  update(table, where, params = {}) {
    return [`UPDATE ${table} SET ${Object.keys(params).join('=?,')}=? WHERE ${where}`, Object.values(params)]
  }

  delete(table, params) {
    return this.whereConditions(`DELETE FROM ${table}`, params)
  }

  whereConditions(query, params) {
    let newQuery = query
    let paramsArray = []

    if (Array.isArray(params)) {
      paramsArray = [...params]
    } else if (typeof params === 'object' && !Array.isArray(params)) {
      // Object to WHERE conditions
      let first = true
      for (const p in params) {
        if (first) newQuery += ' WHERE'
        if (!first) newQuery += ' AND'
        newQuery += ` ${p}=?`
        paramsArray.push(params[p])
        first = false
      }
    }
    return [newQuery, paramsArray]
  }

  async disconnect(dbh) {
    const d = dbh || this.dbh
    if (_debug) console.log(`MySQL connection id ${d.connection.connectionId}`)
    if (d) await d.end()
  }

  debug(val) {
    if (val !== undefined) _debug = val
    return _debug
  }
}

export default new Mysql()
