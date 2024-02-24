const crypto = require('node:crypto')
const validate = require('@nictool/validate')

const Config = require('./config')
const Mysql = require('./mysql')
const Util = require('./util')

class User {
  constructor(args) {
    this.debug = args?.debug ?? false
    this.cfg = Config.getSync('session')
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
    const { error } = validate.user.v2.validate(args)
    if (error) console.error(error)

    const u = await this.get({
      nt_user_id: args.nt_user_id,
      nt_group_id: args.nt_group_id,
    })
    if (u.length) {
      // console.log(u)
      return u[0].nt_user_id
    }

    if (args.password) {
      if (!args.pass_salt) args.pass_salt = this.generateSalt()
      args.password = await this.hashAuthPbkdf2(args.password, args.pass_salt)
    }

    const userId = await Mysql.insert(`INSERT INTO nt_user`, args)
    return userId
  }

  async get(args) {
    return await Mysql.select(
      `SELECT email
      , first_name
      , last_name
      , nt_group_id AS gid
      , nt_user_id AS id
      , username
      , email
     FROM nt_user WHERE`,
      Util.mapToDbColumn(args, { id: 'nt_user_id', gid: 'nt_group_id' }),
    )
  }

  async getAdmin(args) {
    return await Mysql.select(
      `SELECT email
      , first_name
      , last_name
      , nt_group_id AS gid
      , nt_user_id AS id
      , username
      , password
      , email
      , deleted
     FROM nt_user WHERE`,
      Util.mapToDbColumn(args, { id: 'nt_user_id', gid: 'nt_group_id' }),
    )
  }

  async delete(args, val) {
    const u = await this.getAdmin({ nt_user_id: args.nt_user_id })
    if (u.length === 1) {
      await Mysql.execute(`UPDATE nt_user SET deleted=? WHERE nt_user_id=?`, [
        val ?? 1,
        u[0].id,
      ])
    }
  }

  async destroy(args) {
    const u = await this.getAdmin({ nt_user_id: args.nt_user_id })
    if (u.length === 1) {
      await Mysql.execute(`DELETE FROM nt_user WHERE nt_user_id=?`, [u[0].id])
    }
  }

  // async get_perms(user_id) {
  //   return await Mysql.execute(
  //     `
  // 		SELECT ${getPermFields()} FROM nt_perm
  // 		WHERE deleted=0
  // 			AND nt_user_id = ?`,
  //     [user_id],
  //   )
  // }

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

module.exports = new User()
module.exports._mysql = Mysql

/*
function getPermFields() {
  return (
    `nt_perm.` +
    [
      'group_write',
      'group_create',
      'group_delete',

      'zone_write',
      'zone_create',
      'zone_delegate',
      'zone_delete',

      'zonerecord_write',
      'zonerecord_create',
      'zonerecord_delegate',
      'zonerecord_delete',

      'user_write',
      'user_create',
      'user_delete',

      'nameserver_write',
      'nameserver_create',
      'nameserver_delete',

      'self_write',
      'usable_ns',
    ].join(`, nt_perm.`)
  )
}
*/
