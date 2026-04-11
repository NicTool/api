import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse, stringify } from 'smol-toml'

import Config from '../../config.js'
import UserBase from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const boolFields = ['is_admin', 'deleted']

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

  async authenticate(authTry) {
    let [username, groupName] = authTry.username.split('@')
    if (!groupName) groupName = this.cfg.group ?? 'NicTool'

    const users = await this._load()
    for (const u of users) {
      if (u.username !== username) continue
      if (u.deleted) continue

      if (await this.validPassword(authTry.password, u.password, authTry.username, u.pass_salt)) {
        const result = { ...u }
        for (const f of ['password', 'pass_salt']) delete result[f]
        const g = { id: result.gid, name: groupName }
        delete result.gid
        return { user: result, group: g }
      }
    }
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const users = await this._load()
    const results = users.filter((u) => {
      if (args.id !== undefined && u.id !== args.id) return false
      if (args.gid !== undefined && u.gid !== args.gid) return false
      if (args.username !== undefined && u.username !== args.username) return false
      if (args.deleted === false && u.deleted) return false
      return true
    })

    return results.map((u) => {
      const r = { ...u }
      for (const b of boolFields) r[b] = Boolean(r[b])
      if (args.deleted === false) delete r.deleted
      return r
    })
  }

  async create(args) {
    const existing = await this.get({ id: args.id, gid: args.gid })
    if (existing.length === 1) return existing[0].id

    args = JSON.parse(JSON.stringify(args))
    if (args.password) {
      if (!args.pass_salt) args.pass_salt = this.generateSalt()
      args.password = await this.hashAuthPbkdf2(args.password, args.pass_salt)
    }

    const users = await this._load()
    users.push(args)
    await this._save(users)
    return args.id
  }

  async put(args) {
    if (!args.id) return false
    const users = await this._load()
    const idx = users.findIndex((u) => u.id === args.id)
    if (idx === -1) return false

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
