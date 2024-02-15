// const crypto = require('crypto')
const mysql = require('mysql2/promise')

const config = require('./config')

class MySQL {
  constructor() {
    this._debug = config.debug
  }

  async connect() {
    // if (this.dbh && this.dbh?.connection?.connectionId) return this.dbh;

    const cfg = await config.get('mysql')
    if (config.debug) console.log(cfg)

    this.dbh = await mysql.createConnection(cfg)
    if (config.debug)
      console.log(`MySQL connection id ${this.dbh.connection.connectionId}`)
    return this.dbh
  }

  async execute(query, paramsArray) {
    if (!this.dbh || this.dbh?.connection?._closing) {
      if (config.debug) console.log(`(re)connecting to MySQL`)
      this.dbh = await this.connect()
    }

    // console.log(query)
    // console.log(paramsArray)
    const [rows, fields] = await this.dbh.execute(query, paramsArray)
    if (this.debug()) {
      if (fields) console.log(fields)
      console.log(rows)
    }

    if (/^(REPLACE|INSERT) INTO/.test(query)) return rows.insertId

    return rows
  }

  async insert(query, params = {}) {
    if (!this.dbh || this.dbh?.connection?._closing) {
      if (config.debug) console.log(`(re)connecting to MySQL`)
      this.dbh = await this.connect()
    }

    query += `(${Object.keys(params).join(',')}) VALUES(${Object.keys(params).map(() => '?')})`

    // console.log(query)
    // console.log(Object.values(params))
    const [rows, fields] = await this.dbh.execute(query, Object.values(params))
    if (this.debug()) {
      if (fields) console.log(fields)
      console.log(rows)
    }

    return rows.insertId
  }

  async select(query, params = {}) {
    if (!this.dbh || this.dbh?.connection?._closing) {
      if (config.debug) console.log(`(re)connecting to MySQL`)
      this.dbh = await this.connect()
    }

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

    const [rows, fields] = await this.dbh.execute(query, paramsArray)
    if (this.debug()) {
      if (fields) console.log(fields)
      console.log(rows)
    }
    return rows
  }

  async disconnect(dbh) {
    const d = dbh || this.dbh
    if (config.debug)
      console.log(`MySQL connection id ${d.connection.connectionId}`)
    await d.end()
  }

  debug(val) {
    if (val !== undefined) this._debug = val
    return this._debug
  }
}

module.exports = new MySQL()
