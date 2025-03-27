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

    const id = await Mysql.execute(
      ...Mysql.insert(`nt_user_session`, mapToDbColumn(args, sessionDbMap)),
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

  async put(args) {
    if (!args.id) return false

    if (args.last_access) {
      const p = await this.get({ id: args.id })
      if (!p) return false

      // if less than 60 seconds old, do nothing
      const now = parseInt(Date.now() / 1000, 10)
      const oneMinuteAgo = now - 60

      // update only when +1 minute old (save DB writes)
      if (p.last_access > oneMinuteAgo) return true
      args.last_access = now
    }

    const id = args.id
    delete args.id
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_user_session`,
        `nt_user_session_id=${id}`,
        mapToDbColumn(args, sessionDbMap),
      ),
    )
    // console.log(r)
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.delete(`nt_user_session`, mapToDbColumn(args, sessionDbMap)),
    )
    return r.affectedRows === 1
  }
}

export default new Session()
