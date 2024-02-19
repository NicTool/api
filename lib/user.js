const crypto = require('node:crypto')
const validate = require('@nictool/nt-validate')

const mysql = require('./mysql')

class User {
  constructor(args) {
    this.debug = args?.debug ?? false
  }

  async authenticate(authTry) {
    if (this.debug) console.log(authTry)
    let [username, group] = authTry.username.split('@')
    if (!group) group = 'NicTool'

    const query = `SELECT nt_user.*, nt_group.name AS groupname
    FROM nt_user, nt_group
    WHERE nt_user.nt_group_id = nt_group.nt_group_id
      AND nt_group.deleted=0
      AND nt_user.deleted=0
      AND nt_user.username = ?
      AND nt_group.name = ?`

    for (const u of await mysql.execute(query, [username, group])) {
      if (
        await this.validPassword(
          authTry.password,
          u.password,
          authTry.username,
          u.pass_salt,
        )
      )
        return u
    }
  }

  async create(args) {
    const { error } = validate.user.validate(args)
    if (error) console.error(error)

    const u = await this.read({
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

    const userId = await mysql.insert(`INSERT INTO nt_user`, args)
    return userId
  }

  async read(args) {
    return await mysql.select(
      `SELECT email, first_name, last_name, nt_group_id, nt_user_id, username, email, deleted
     FROM nt_user WHERE`,
      args,
    )
  }

  async delete(args, val) {
    const u = await this.read({ nt_user_id: args.nt_user_id })
    if (u.length === 1) {
      await mysql.execute(`UPDATE nt_user SET deleted=? WHERE nt_user_id=?`, [
        val ?? 1, u[0].nt_user_id,
      ])
    }
  }

  async destroy(args) {
    const u = await this.read({ nt_user_id: args.nt_user_id })
    if (u.length === 1) {
      await mysql.execute(`DELETE FROM nt_user WHERE nt_user_id=?`, [
        u[0].nt_user_id,
      ])
    }
  }

  async get_perms(user_id) {
    return await mysql.execute(
      `
			SELECT ${getPermFields()} FROM nt_perm
			WHERE deleted=0
				AND nt_user_id = ?`,
      [user_id],
    )
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
      const digest = crypto.createHmac('sha1', username.toLowerCase())
        .update(passTry)
        .digest('hex')
      if (this.debug) console.log(`digest: (${digest === passDb}) ${digest}`)
      return digest === passDb
    }

    return false
  }

  async getSession(sessionId) {
    let query = `SELECT s.*
  FROM nt_user_session s
    LEFT JOIN nt_user u ON s.nt_user_id = u.nt_user_id
  WHERE u.deleted=0
    AND s.nt_user_session = ?`

    const session = await mysql.execute(query, [sessionId])
    if (this.debug) console.log(session)
    return session[0]
  }
}

module.exports = new User()
module.exports._mysql = mysql

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
