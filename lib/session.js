import Mysql from './mysql.js'

export default class Session {
  constructor() {
    this.mysql = new Mysql()
  }

  async create(args) {
    const r = await this.get(args)
    if (r) return r.nt_user_session_id

    const id = await this.mysql.insert(`INSERT INTO nt_user_session`, {
      nt_user_id: args.nt_user_id,
      nt_user_session: args.nt_user_session,
      last_access: parseInt(Date.now() / 1000, 10),
    })
    return id
  }

  async get(args) {
    let query = `SELECT s.*
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

    const sessions = await this.mysql.execute(query, params)
    return sessions[0]
  }

  async delete(args) {
    const r = await this.mysql.execute(
      `DELETE FROM nt_user_session WHERE nt_user_session_id=?`,
      [args.nt_user_session_id],
    )
    return r.affectedRows === 1
  }
}
