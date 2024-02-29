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
    // if (this.dbh && this.dbh?.connection?.connectionId) return this.dbh;

    const cfg = await Config.get('mysql')
    if (_debug) console.log(cfg)

    this.dbh = await mysql.createConnection(cfg)
    if (_debug)
      console.log(`MySQL connection id ${this.dbh.connection.connectionId}`)
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

    const [queryWhere, paramsArray] = this.whereConditions(query, params)

    if (skipExecute) return queryWhere
    return await this.execute(queryWhere, paramsArray)
  }

  async update(query, where, params = {}) {
    const skipExecute = params.skipExecute ?? false
    delete params.skipExecute

    query += ` ${Object.keys(params).join('=?,')}=? ${where}`

    if (skipExecute) return { q: query, p: Object.values(params) }
    return await this.execute(query, Object.values(params))
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
        if (!first) newQuery += ' AND'
        newQuery += ` ${p}=?`
        paramsArray.push(params[p])
        first = false
      }
    }
    return [newQuery, paramsArray]
  }

  async delete(query, params) {
    const [queryWhere, paramsArray] = this.whereConditions(query, params)
    return await this.execute(queryWhere, paramsArray)
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
