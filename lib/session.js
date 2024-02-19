// const crypto = require('crypto')
// const { createHmac, pbkdf2 } = require('node:crypto')

const Mysql = require('./mysql')

// const User  = require('./user')

// const validate = require('@nictool/nt-validate')

class Session {
  constructor() {}

  async create(args) {
    const r = await this.read({ nt_user_session: args.nt_user_session })
    if (r) return r

    const query = `INSERT INTO nt_user_session`

    const id = await Mysql.insert(query, {
      nt_user_id: args.nt_user_id,
      nt_user_session: args.nt_user_session,
      last_access: parseInt(Date.now() / 1000, 10),
    })

    return id
  }

  async read(args) {
    let query = `SELECT s.*
  FROM nt_user_session s
    LEFT JOIN nt_user u ON s.nt_user_id = u.nt_user_id
  WHERE u.deleted=0`

    const params = []
    if (args.id) {
      query += ` AND s.nt_user_session_id = ?`
      params.push(args.id)
    }
    if (args.nt_user_session) {
      query += ` AND s.nt_user_session = ?`
      params.push(args.nt_user_session)
    }

    const sessions = await Mysql.execute(query, params)
    // console.log(sessions)
    return sessions[0]
  }
}

module.exports = new Session()
module.exports._mysql = Mysql
