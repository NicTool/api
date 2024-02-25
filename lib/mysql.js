// const crypto = require('crypto')
const mysql = require('mysql2/promise')

const util = require('./util')
util.setEnv()
const config = require('./config')

class MySQL {
  constructor() {
    this._debug = config.debug
  }

  async connect() {
    // if (this.dbh && this.dbh?.connection?.connectionId) return this.dbh;

    const cfg = await config.get('mysql')
    if (this._debug) console.log(cfg)

    this.dbh = await mysql.createConnection(cfg)
    if (this._debug)
      console.log(`MySQL connection id ${this.dbh.connection.connectionId}`)
    return this.dbh
  }

  async execute(query, paramsArray) {
    if (!this.dbh || this.dbh?.connection?._closing) {
      if (this._debug) console.log(`(re)connecting to MySQL`)
      this.dbh = await this.connect()
    }

    if (this._debug) console.log(query)
    if (this._debug) console.log(paramsArray)
    const [rows, fields] = await this.dbh.execute(query, paramsArray)
    if (this._debug) {
      if (fields) console.log(fields)
      console.log(rows)
    }

    if (/^(REPLACE|INSERT) INTO/.test(query)) return rows.insertId

    return rows
  }

  async insert(query, params = {}) {
    const skipExecute = params.skipExecute ?? false
    delete params.skipExecute

    query += `(${Object.keys(params).join(',')}) VALUES(${Object.keys(params).map(() => '?')})`

    if (skipExecute) return query
    return await this.execute(query, Object.values(params))
  }

  async select(query, params = {}) {
    const skipExecute = params.skipExecute ?? false
    delete params.skipExecute

    let paramsArray = []
    if (Array.isArray(params)) {
      paramsArray = [...params]
    } else if (typeof params === 'object' && !Array.isArray(params)) {
      // Object to SQL. Eg. { id: 'sample' } -> SELECT...WHERE id=?, ['sample']
      let first = true
      for (const p in params) {
        if (!first) query += ' AND'
        query += ` ${p}=?`
        paramsArray.push(params[p])
        first = false
      }
    }

    if (skipExecute) return query
    return await this.execute(query, paramsArray)
  }

  async update(query, where, params = {}) {
    const skipExecute = params.skipExecute ?? false
    delete params.skipExecute

    query += ` ${Object.keys(params).join('=?,')}=? ${where}`

    if (skipExecute) return { q: query, p: Object.values(params) }
    return await this.execute(query, Object.values(params))
  }

  async disconnect(dbh) {
    const d = dbh || this.dbh
    if (this._debug)
      console.log(`MySQL connection id ${d.connection.connectionId}`)
    await d.end()
  }

  debug(val) {
    if (val !== undefined) this._debug = val
    return this._debug
  }
}

module.exports = new MySQL()
