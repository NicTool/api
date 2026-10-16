import FileStore, { claimId, removeRows } from '../../store/file.js'
import { isV3Session } from '../v3.js'

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

  async create(args) {
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    return this.file.mutate('session', (sessions, data) => {
      args.id = claimId(sessions, data)
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

      return this.file.mutate('session', (sessions) => {
        const row = sessions.find((s) => s.id === args.id)
        if (!row) return false
        row.last_access = now
        return true
      })
    }

    const id = args.id
    delete args.id
    return this.file.mutate('session', (sessions) => {
      const idx = sessions.findIndex((s) => s.id === id)
      if (idx === -1) return false
      sessions[idx] = { ...sessions[idx], ...args, id }
      return true
    })
  }

  /**
   * Removes sessions that match ALL provided filters (AND semantics).
   * Supports: { id }, { uid }, { id, session }, etc.
   */
  async delete(args) {
    args = normalizeArgs(JSON.parse(JSON.stringify(args)))

    return this.file.mutate(
      'session',
      (sessions) =>
        removeRows(sessions, (s) => {
          if (args.id !== undefined && s.id !== args.id) return false
          if (args.uid !== undefined && s.uid !== args.uid) return false
          if (args.session !== undefined && s.session !== args.session) return false
          return true
        }) > 0,
    )
  }

  async expire({ uid, before }) {
    return this.file.mutate('session', (sessions, data, keep) => {
      const removed = removeRows(
        sessions,
        (s) => s.uid === uid && isV3Session(s.session) && s.last_access < before,
      )
      return removed > 0 ? removed : keep(0)
    })
  }

  disconnect() {
    // noop
  }
}

export default SessionRepoFile
