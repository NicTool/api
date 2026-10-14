import FileStore, { nextId, removeRows } from '../../store/file.js'
import { idConflict } from '../../store/error.js'
import Config from '../../config.js'
import Credentials from '../credentials.js'
import UserBase from './base.js'
import { splitQualifiedUsername } from '../qualified.js'

const boolFields = ['is_admin', 'deleted']

// Read the group file directly (never via the Group module) to avoid circular imports.
async function loadGroupPerm(groupFile, gid) {
  const groups = await groupFile.load('group')
  return groups.find((g) => g.id === gid)?.permissions ?? null
}

const defaultPermissions = {
  inherit: false,
  self_write: false,
  group: { create: false, write: false, delete: false },
  nameserver: { usable: [], create: false, write: false, delete: false },
  zone: { create: false, write: false, delete: false, delegate: false },
  zonerecord: { create: false, write: false, delete: false, delegate: false },
  user: { create: false, write: false, delete: false },
}

class UserRepoFile extends UserBase {
  constructor(args = {}) {
    super(args)
    this.cfg = Config.getSync('http')
    this.file = new FileStore('user')
    this.groupFile = new FileStore('group')
  }

  async _load() {
    return this.file.load('user')
  }

  _postProcess(u, deletedArg) {
    const r = { ...u }
    // Remove sensitive credential fields — these are stored internally but never
    // exposed via get().  authenticate() reads the raw record directly.
    delete r.password
    delete r.pass_salt
    for (const b of boolFields) r[b] = Boolean(r[b])
    if (r.permissions) {
      r.inherit_group_permissions = r.permissions.inherit !== false
    }
    if (deletedArg === false) delete r.deleted
    return r
  }

  async authenticate(authTry) {
    const { username, groupName } = splitQualifiedUsername(authTry.username, this.cfg.group ?? 'NicTool')
    const groups = await this.groupFile.load('group')

    const users = await this._load()
    for (const u of users) {
      if (u.username !== username) continue
      if (u.deleted) continue
      const group = groups.find((g) => g.id === u.gid && g.name === groupName && !g.deleted)
      if (!group) continue

      const { valid, needsUpgrade } = await Credentials.validPassword(
        authTry.password,
        u.password,
        authTry.username,
        u.pass_salt,
      )
      if (valid) {
        // best effort, as in the MySQL repo: a failed rewrite must not cost
        // the user their login
        if (needsUpgrade) {
          try {
            const upgraded = await Credentials.forStorage(authTry.password)
            await this.file.mutate('user', (current) => {
              const row = current.find((c) => c.id === u.id)
              if (row?.password !== u.password || row.pass_salt !== u.pass_salt) return false
              Object.assign(row, upgraded)
            })
          } catch (err) {
            console.warn(`password hash upgrade failed for user ${authTry.username}`, err)
          }
        }

        const result = { ...u }
        for (const f of ['password', 'pass_salt', 'permissions']) delete result[f]
        const g = { id: result.gid, name: group.name }
        delete result.gid
        return { user: result, group: g }
      }
    }
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    let users = await this._load()

    if (args.id !== undefined) users = users.filter((u) => u.id === args.id)
    if (args.gid !== undefined) users = users.filter((u) => u.gid === args.gid)
    if (args.username !== undefined) users = users.filter((u) => u.username === args.username)
    if (deletedArg === false) users = users.filter((u) => !u.deleted)
    else if (deletedArg !== undefined) users = users.filter((u) => Boolean(u.deleted) === Boolean(deletedArg))

    const result = []
    for (const u of users) {
      const r = this._postProcess(u, deletedArg)
      if (!r.permissions) {
        // Inheriting user: attach the group's inline permissions
        const groupPerm = await loadGroupPerm(this.groupFile, u.gid)
        if (groupPerm) {
          r.permissions = JSON.parse(JSON.stringify(groupPerm))
          r.inherit_group_permissions = true
        }
      }
      result.push(r)
    }
    return result
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    const deletedArg = args.deleted ?? false

    let users = await this._load()

    if (args.id !== undefined) users = users.filter((u) => u.id === args.id)
    if (args.gid !== undefined) users = users.filter((u) => u.gid === args.gid)
    if (args.username !== undefined) users = users.filter((u) => u.username === args.username)
    if (deletedArg === false) users = users.filter((u) => !u.deleted)
    else if (deletedArg !== undefined) users = users.filter((u) => Boolean(u.deleted) === Boolean(deletedArg))

    return users.length
  }

  async create(args, options) {
    args = JSON.parse(JSON.stringify(args))

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    if (args.password) {
      Object.assign(args, await Credentials.forStorage(args.password, args.pass_salt))
    }

    return this.file.mutate('user', (users, data) => {
      if (args.id !== undefined && users.some((user) => user.id === args.id)) {
        return idConflict('user', args.id, options)
      }

      if (args.id === undefined) args.id = nextId(users, data.last_id)
      data.last_id = Math.max(data.last_id ?? 0, args.id)

      if (inherit === false) {
        args.permissions = {
          ...JSON.parse(JSON.stringify(defaultPermissions)),
          id: args.id,
          user: { id: args.id, create: false, write: false, delete: false },
          group: { id: args.gid, create: false, write: false, delete: false },
        }
      }

      users.push(args)
      return args.id
    })
  }

  async put(args) {
    if (!args.id) return false
    args = JSON.parse(JSON.stringify(args))

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    return this.file.mutate('user', (users) => {
      const idx = users.findIndex((u) => u.id === args.id)
      if (idx === -1) return false

      if (inherit === true) {
        // Switch to inherited: remove explicit permissions
        delete users[idx].permissions
      } else if (inherit === false && !users[idx].permissions) {
        // Switch to explicit: create default permission entry
        users[idx].permissions = {
          ...JSON.parse(JSON.stringify(defaultPermissions)),
          id: users[idx].id,
          user: { id: users[idx].id, create: false, write: false, delete: false },
          group: { id: users[idx].gid, create: false, write: false, delete: false },
        }
      } else if (inherit === false && users[idx].permissions) {
        users[idx].permissions.inherit = false
      }

      users[idx] = { ...users[idx], ...args }
      return true
    })
  }

  async delete(args) {
    return this.file.mutate('user', (users) => {
      const row = users.find((u) => u.id === args.id)
      if (!row) return false
      row.deleted = args.deleted ?? true
      return true
    })
  }

  async destroy(args) {
    return this.file.mutate('user', (users) => removeRows(users, (u) => u.id === args.id) > 0)
  }
}

export default UserRepoFile
