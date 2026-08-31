import FileStore, { nextId } from '../../store/file.js'

// Map legacy nt_* column names to the friendly API names used throughout.
function normalizeArgs(args) {
  if (args.nt_user_session_id !== undefined) {
    args.id = args.nt_user_session_id
    delete args.nt_user_session_id
  }
  if (args.nt_user_id !== undefined) {
    args.uid = args.nt_user_id
    delete args.nt_user_id
  }
  if (args.nt_user_session !== undefined) {
    args.session = args.nt_user_session
    delete args.nt_user_session
  }
  return args
}

class SessionRepoFile {
  constructor() {
    this.file = new FileStore('session')
  }

  async _load() {
    return this.file.load('session')
  }

  async _save(sessions) {
    return this.file.save('session', sessions)
  }

  async create(args) {
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    return this.file.mutate('session', (sessions, data) => {
      const existing = sessions.find(
        (session) => session.uid === args.uid && session.session === args.session,
      )
      if (existing) return existing.id

      args.id = nextId(sessions, data.last_id)
      data.last_id = args.id
      sessions.push(args)
      return args.id
    })
  }

  async get(args) {
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    const sessions = await this._load()
    return sessions.find((s) => {
      if (args.id !== undefined && s.id !== args.id) return false
      if (args.uid !== undefined && s.uid !== args.uid) return false
      if (args.session !== undefined && s.session !== args.session) return false
      return true
    })
  }

  async put(args) {
    if (!args.id) return false
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    if (args.last_access) {
      const s = await this.get({ id: args.id })
      if (!s) return false

      // Only write when last_access is more than 1 minute old (reduce I/O)
      const now = parseInt(Date.now() / 1000, 10)
      if (s.last_access > now - 60) return true

      const sessions = await this._load()
      const idx = sessions.findIndex((s) => s.id === args.id)
      if (idx === -1) return false
      sessions[idx].last_access = now
      await this._save(sessions)
      return true
    }

    const sessions = await this._load()
    const idx = sessions.findIndex((s) => s.id === args.id)
    if (idx === -1) return false
    const id = args.id
    delete args.id
    sessions[idx] = { ...sessions[idx], ...args, id }
    await this._save(sessions)
    return true
  }

  /**
   * Removes sessions that match ALL provided filters (AND semantics).
   * Supports: { id }, { uid }, { id, session }, etc.
   */
  async delete(args) {
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    const sessions = await this._load()
    const before = sessions.length

    const filtered = sessions.filter((s) => {
      // Keep this session unless every provided filter matches it
      if (args.id !== undefined && s.id !== args.id) return true
      if (args.uid !== undefined && s.uid !== args.uid) return true
      if (args.session !== undefined && s.session !== args.session) return true
      return false // all conditions matched → remove
    })

    if (filtered.length === before) return false
    await this._save(filtered)
    return true
  }

  disconnect() {
    // noop
  }
}

export default SessionRepoFile
