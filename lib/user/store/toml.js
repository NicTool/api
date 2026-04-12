import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import Config from '../../config.js'
import UserBase from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const boolFields = ['is_admin', 'deleted']

// Read group.toml directly (never via the Group module) to avoid circular imports.
async function loadGroupPerm(groupPath, gid) {
  try {
    const str = await fs.readFile(groupPath, 'utf8')
    const data = parse(str)
    const groups = Array.isArray(data.group) ? data.group : []
    return groups.find((g) => g.id === gid)?.permissions ?? null
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
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

function resolveStorePath(filename) {
  const base = process.env.NICTOOL_DATA_STORE_PATH
  if (base) return path.join(base, filename)
  return path.resolve(__dirname, '../../../conf.d', filename)
}

class UserRepoTOML extends UserBase {
  constructor(args = {}) {
    super(args)
    this.cfg = Config.getSync('http')
    this._filePath = resolveStorePath('user.toml')
    this._groupPath = resolveStorePath('group.toml')
  }

  async _load() {
    try {
      const str = await fs.readFile(this._filePath, 'utf8')
      const data = parse(str)
      return Array.isArray(data.user) ? data.user : []
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async _save(users) {
    await fs.mkdir(path.dirname(this._filePath), { recursive: true })
    await fs.writeFile(this._filePath, stringify({ user: users }))
  }

  _postProcess(u, deletedArg) {
    const r = { ...u }
    for (const b of boolFields) r[b] = Boolean(r[b])
    if (r.permissions) {
      r.inherit_group_permissions = r.permissions.inherit !== false
    }
    if (deletedArg === false) delete r.deleted
    return r
  }

  async authenticate(authTry) {
    let [username, groupName] = authTry.username.split('@')
    if (!groupName) groupName = this.cfg.group ?? 'NicTool'

    const users = await this._load()
    for (const u of users) {
      if (u.username !== username) continue
      if (u.deleted) continue

      if (await this.validPassword(authTry.password, u.password, authTry.username, u.pass_salt)) {
        const result = { ...u }
        for (const f of ['password', 'pass_salt', 'permissions']) delete result[f]
        const g = { id: result.gid, name: groupName }
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
        const groupPerm = await loadGroupPerm(this._groupPath, u.gid)
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

  async create(args) {
    if (args.id) {
      const existing = await this.get({ id: args.id })
      if (existing.length === 1) return existing[0].id
    }

    args = JSON.parse(JSON.stringify(args))

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

    if (args.password) {
      if (!args.pass_salt) args.pass_salt = this.generateSalt()
      args.password = await this.hashAuthPbkdf2(args.password, args.pass_salt)
    }

    if (inherit === false) {
      args.permissions = {
        ...JSON.parse(JSON.stringify(defaultPermissions)),
        id: args.id,
        user: { id: args.id, create: false, write: false, delete: false },
        group: { id: args.gid, create: false, write: false, delete: false },
      }
    }

    const users = await this._load()
    users.push(args)
    await this._save(users)
    return args.id
  }

  async put(args) {
    if (!args.id) return false
    args = JSON.parse(JSON.stringify(args))

    const users = await this._load()
    const idx = users.findIndex((u) => u.id === args.id)
    if (idx === -1) return false

    const inherit = args.inherit_group_permissions
    delete args.inherit_group_permissions

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
    await this._save(users)
    return true
  }

  async delete(args) {
    const users = await this._load()
    const idx = users.findIndex((u) => u.id === args.id)
    if (idx === -1) return false

    users[idx].deleted = args.deleted ?? true
    await this._save(users)
    return true
  }

  async destroy(args) {
    const users = await this._load()
    const before = users.length
    const filtered = users.filter((u) => u.id !== args.id)
    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }
}

export default UserRepoTOML
