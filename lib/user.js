import crypto from 'node:crypto'

import Mysql from './mysql.js'
import Config from './config.js'
import { mapToDbColumn } from './util.js'

const userDbMap = { id: 'nt_user_id', gid: 'nt_group_id' }
const boolFields = [ 'is_admin', 'deleted' ]

class User {
  constructor(args = {}) {
    this.debug = args?.debug ?? false
    this.cfg = Config.getSync('http')
    this.mysql = Mysql
  }

  async authenticate(authTry) {
    if (this.debug) console.log(authTry)
    let [username, groupName] = authTry.username.split('@')
    if (!groupName) groupName = this.cfg.group ?? 'NicTool'

    const query = `SELECT u.nt_user_id AS id
      , u.nt_group_id
      , u.first_name
      , u.last_name
      , u.username
      , u.password
      , u.pass_salt
      , u.email
    /*, u.is_admin */
      , g.name AS group_name
    FROM nt_user u, nt_group g
    WHERE u.nt_group_id = g.nt_group_id
      AND g.deleted=0
      AND u.deleted=0
      AND u.username = ?
      AND g.name = ?`

    for (const u of await Mysql.execute(query, [username, groupName])) {
      if (
        await this.validPassword(
          authTry.password,
          u.password,
          authTry.username,
          u.pass_salt,
        )
      ) {
        for (const f of ['password', 'pass_salt']) {
          delete u[f] // SECURITY: no longer needed
        }
        for (const b of ['is_admin']) {
          if (u[b] !== undefined) u[b] = u[b] === 1 // int to boolean
        }
        const g = {
          id: u.nt_group_id,
          name: groupName,
        }
        delete u.nt_group_id
        delete u.group_name
        return { user: u, group: g }
      }
    }
  }

  async create(args) {
    const u = await this.get({ id: args.id, gid: args.gid })
    if (u.length === 1) return u[0].id

    if (args.password) {
      if (!args.pass_salt) args.pass_salt = this.generateSalt()
      args.password = await this.hashAuthPbkdf2(args.password, args.pass_salt)
    }

    const userId = await Mysql.execute(...Mysql.insert(`nt_user`, mapToDbColumn(args, userDbMap)))
    return userId
  }

  async get(args) {
    if (args.deleted === undefined) args.deleted = false
    const rows = await Mysql.execute(...Mysql.select(
      `SELECT email
      , first_name
      , last_name
      , nt_group_id AS gid
      , nt_user_id AS id
      , username
      , email
      , deleted
     FROM nt_user`,
      mapToDbColumn(args, userDbMap),
    ))
    for (const r of rows) {
      for (const b of boolFields) {
        r[b] = r[b] === 1
      }
    }
    return rows
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    const r = await Mysql.execute(...Mysql.update(
      `nt_user`,
      `nt_user_id=${id}`,
      mapToDbColumn(args, userDbMap),
    ))
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      `UPDATE nt_user SET deleted=? WHERE nt_user_id=?`,
      [args.deleted ?? 1, args.id],
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    await Mysql.execute(...Mysql.delete(`nt_user`, mapToDbColumn({ id: u[0].id }, userDbMap)))
  }

  generateSalt(length = 16) {
    const chars = Array.from({ length: 87 }, (_, i) =>
      String.fromCharCode(i + 40),
    ) // ASCII 40-126
    let salt = ''
    for (let i = 0; i < length; i++) {
      salt += chars[Math.floor(Math.random() * 87)]
    }
    return salt
  }

  async hashAuthPbkdf2(pass, salt) {
    return new Promise((resolve, reject) => {
      // match the defaults for NicTool 2.x
      crypto.pbkdf2(pass, salt, 5000, 32, 'sha512', (err, derivedKey) => {
        if (err) return reject(err)
        resolve(derivedKey.toString('hex'))
      })
    })
  }

  async validPassword(passTry, passDb, username, salt) {
    if (!salt && passTry === passDb) return true // plain pass, TODO, encrypt!

    if (salt) {
      const hashed = await this.hashAuthPbkdf2(passTry, salt)
      if (this.debug) console.log(`hashed: (${hashed === passDb}) ${hashed}`)
      return hashed === passDb
    }

    // Check for HMAC SHA-1 password
    if (/^[0-9a-f]{40}$/.test(passDb)) {
      const digest = crypto
        .createHmac('sha1', username.toLowerCase())
        .update(passTry)
        .digest('hex')
      if (this.debug) console.log(`digest: (${digest === passDb}) ${digest}`)
      return digest === passDb
    }

    return false
  }
}

export default new User()
