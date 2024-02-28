import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const sessionDbMap = {
  id: 'nt_user_session_id',
  uid: 'nt_user_id',
  session: 'nt_user_session',
}

class Session {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    const r = await this.get(args)
    if (r) return r.id

    const id = await Mysql.insert(
      `INSERT INTO nt_user_session`,
      mapToDbColumn(args, sessionDbMap),
    )
    return id
  }

  async get(args) {
    let query = `SELECT s.nt_user_session_id AS id
    , s.nt_user_id AS uid
    , s.nt_user_session AS session
  FROM nt_user_session s
    LEFT JOIN nt_user u ON s.nt_user_id = u.nt_user_id
  WHERE u.deleted=0`

    const params = []
    for (const f of ['nt_user_session_id', 'nt_user_id', 'nt_user_session']) {
      if (args[f] !== undefined) {
        query += ` AND s.${f} = ?`
        params.push(args[f])
      }
    }
    for (const g of ['id', 'uid', 'session']) {
      if (args[g] !== undefined) {
        query += ` AND s.${sessionDbMap[g]} = ?`
        params.push(args[g])
      }
    }

    const sessions = await Mysql.execute(query, params)
    return sessions[0]
  }

  async delete(args) {
    const r = await Mysql.select(
      `DELETE FROM nt_user_session WHERE`,
      mapToDbColumn(args, sessionDbMap),
    )
    return r.affectedRows === 1
  }
}

export default new Session()
