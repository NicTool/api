import FileStore from '../../store/file.js'
import Config from '../../config.js'
import Credentials from '../credentials.js'
import Permission from '../../permission/index.js'
import UserBase from './base.js'

const boolFields = ['is_admin', 'deleted']
let userWriteQueue = Promise.resolve()

async function withUserWriteLock(fn) {
  const previous = userWriteQueue
  let release
  userWriteQueue = new Promise((resolve) => { release = resolve })
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

// Read the group file directly (never via the Group module) to avoid circular imports.
async function loadGroupPerm(groupFile, gid) {
  const groups = await groupFile.load('group')
  return groups.find((g) => g.id === gid)?.permissions ?? null
}

async function groupIds(groupFile, gid, includeSubgroups) {
  if (!includeSubgroups) return [gid]
  const groups = await groupFile.load('group')
  const ids = [gid]
  for (let i = 0; i < ids.length; i += 1) {
    for (const group of groups) {
      if (group.parent_gid === ids[i] && !ids.includes(group.id)) ids.push(group.id)
    }
  }
  return ids
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

  async _save(users) {
    return this.file.save('user', users)
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
    let [username, groupName] = authTry.username.split('@')
    if (!groupName) groupName = this.cfg.group ?? 'NicTool'

    const users = await this._load()
    for (const u of users) {
      if (u.username !== username) continue
      if (u.deleted) continue

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
            Object.assign(u, await Credentials.forStorage(authTry.password))
            await this._save(users)
          } catch (err) {
            console.warn(`password hash upgrade failed for user ${authTry.username}`, err)
          }
        }

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
    if (args.gid !== undefined) {
      const gids = await groupIds(this.groupFile, args.gid, args.include_subgroups === true)
      users = users.filter((u) => gids.includes(u.gid))
    }
    if (args.username !== undefined) users = users.filter((u) => u.username === args.username)
    if (deletedArg === false) users = users.filter((u) => !u.deleted)
    else if (deletedArg !== undefined) users = users.filter((u) => Boolean(u.deleted) === Boolean(deletedArg))

    const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''
    if (search) {
      users = users.filter((u) => {
        const username = u.username.toLowerCase()
        return args.exact_match === true ? username === search : username.includes(search)
      })
    }

    const sortBy = ['id', 'username', 'email', 'first_name', 'last_name'].includes(args.sort_by)
      ? args.sort_by
      : 'username'
    const direction = args.sort_dir === 'desc' ? -1 : 1
    users.sort((a, b) => `${a[sortBy] ?? ''}`.localeCompare(`${b[sortBy] ?? ''}`) * direction)

    const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0
    const limit = Number.isInteger(args.limit) ? Math.max(1, args.limit) : users.length
    users = users.slice(offset, offset + limit)

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
    if (args.gid !== undefined) {
      const gids = await groupIds(this.groupFile, args.gid, args.include_subgroups === true)
      users = users.filter((u) => gids.includes(u.gid))
    }
    if (args.username !== undefined) users = users.filter((u) => u.username === args.username)
    if (deletedArg === false) users = users.filter((u) => !u.deleted)
    else if (deletedArg !== undefined) users = users.filter((u) => Boolean(u.deleted) === Boolean(deletedArg))

    const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''
    if (search) {
      users = users.filter((u) => {
        const username = u.username.toLowerCase()
        return args.exact_match === true ? username === search : username.includes(search)
      })
    }

    return users.length
  }

  async create(args) {
    return withUserWriteLock(async () => {
      const users = await this._load()
      if (args.id && users.some((user) => user.id === args.id)) return args.id

      args = JSON.parse(JSON.stringify(args))
      if (args.id === undefined) {
        args.id = users.reduce((max, user) => Math.max(max, user.id ?? 0), 0) + 1
      }

      const inherit = args.inherit_group_permissions
      delete args.inherit_group_permissions

      if (args.password) {
        Object.assign(args, await Credentials.forStorage(args.password, args.pass_salt))
      }

      users.push(args)
      await this._save(users)
      if (inherit === false) {
        await Permission.create({
          uid: args.id,
          gid: args.gid,
          inherit: false,
          name: `User ${args.username} perms`,
        })
      }
      return args.id
    })
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
      delete users[idx].permissions
    } else if (inherit === false && users[idx].permissions) {
      users[idx].permissions.inherit = false
    }

    if (args.gid !== undefined && users[idx].permissions?.group) {
      users[idx].permissions.group.id = args.gid
    }

    users[idx] = { ...users[idx], ...args }
    await this._save(users)
    if (inherit === false && !users[idx].permissions) {
      await Permission.create({
        uid: users[idx].id,
        gid: users[idx].gid,
        inherit: false,
        name: `User ${users[idx].username} perms`,
      })
    }
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

export default UserRepoFile
