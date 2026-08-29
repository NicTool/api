import FileStore from '../../store/file.js'
import { pageLimit } from '../../page.js'

import AuditBase from './base.js'

class AuditRepoFile extends AuditBase {
  constructor() {
    super()
    this.zoneLog = new FileStore('zone_log')
    this.recordLog = new FileStore('record_log')
    this.globalLog = new FileStore('global_log')
  }

  async insertZoneLog(detail) {
    return this.zoneLog.update('zone_log', (rows) => {
      const row = { id: nextId(rows), ...detail }
      rows.push(row)
      return row.id
    })
  }

  async insertZoneRecordLog(detail) {
    return this.recordLog.update('record_log', (rows) => {
      const row = { id: nextId(rows), ...detail }
      rows.push(row)
      return row.id
    })
  }

  async insertGlobalLog(entry) {
    await this.globalLog.update('global_log', (rows) =>
      rows.push({
        id: nextId(rows),
        uid: entry.uid,
        timestamp: entry.timestamp,
        action: entry.action,
        object: entry.object,
        object_id: entry.objectId,
        log_entry_id: entry.logId,
        title: entry.title,
        description: entry.description,
      }),
    )
  }

  async listGlobal(args) {
    const users = await loadUsers()
    const groups = await loadGroups()
    let rows = (await this.globalLog.load('global_log')).map((row) => {
      const user = users.find((u) => u.id === row.uid)
      return {
        ...row,
        gid: user?.gid,
        group_name: groups.find((g) => g.id === user?.gid)?.name ?? '',
        user: displayUser(user),
      }
    })

    const gids = intValues(args.gids)
    rows = rows.filter((row) => gids.includes(row.gid))
    if (Number.isInteger(args.uid)) rows = rows.filter((row) => row.uid === args.uid)

    return page(rows, args, {
      searchKeys: ['user', 'action', 'object', 'title', 'description'],
      sortMap: {
        timestamp: 'timestamp',
        user: 'user',
        action: 'action',
        object: 'object',
        title: 'title',
        description: 'description',
        group_name: 'group_name',
      },
    })
  }

  async listZones(args) {
    const users = await loadUsers()
    const groups = await loadGroups()
    const rows = (await this.zoneLog.load('zone_log')).map((row) => ({
      ...row,
      group_name: groups.find((g) => g.id === row.gid)?.name ?? '',
      user: displayUser(users.find((u) => u.id === row.uid)),
    }))

    const gids = intValues(args.gids)
    const scoped = rows.filter((row) => gids.includes(row.gid))

    return page(scoped, args, {
      searchKeys: ['zone', 'description', 'action', 'user', 'group_name'],
      sortMap: {
        timestamp: 'timestamp',
        user: 'user',
        action: 'action',
        zone: 'zone',
        ttl: 'ttl',
        description: 'description',
        group_name: 'group_name',
      },
    })
  }

  async listZoneRecords(args) {
    const users = await loadUsers()
    let rows = (await this.recordLog.load('record_log')).map((row) => ({
      ...row,
      user: displayUser(users.find((u) => u.id === row.uid)),
    }))

    rows = rows.filter((row) => row.zid === args.zid)
    if (Number.isInteger(args.id)) rows = rows.filter((row) => row.id === args.id)
    if (Array.isArray(args.ids)) rows = rows.filter((row) => args.ids.includes(row.zrid))

    return page(rows, args, {
      searchKeys: ['owner', 'description', 'type', 'address', 'action', 'user'],
      sortMap: {
        timestamp: 'timestamp',
        user: 'user',
        action: 'action',
        owner: 'owner',
        type: 'type',
        address: 'address',
        ttl: 'ttl',
        weight: 'weight',
        description: 'description',
      },
    })
  }

  async destroyByUser(uid) {
    const remove = (store, key) =>
      store.update(key, (rows) => {
        let removed = false
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].uid === uid) {
            rows.splice(i, 1)
            removed = true
          }
        }
        return removed
      })
    const results = await Promise.all([
      remove(this.zoneLog, 'zone_log'),
      remove(this.recordLog, 'record_log'),
      remove(this.globalLog, 'global_log'),
    ])
    return results.some(Boolean)
  }
}

async function loadUsers() {
  return new FileStore('user').load('user')
}

async function loadGroups() {
  return new FileStore('group').load('group')
}

function displayUser(user) {
  if (!user) return ''
  return `${user.first_name ?? ''} ${user.last_name ?? ''} (${user.username})`.trim()
}

function intValues(values) {
  return (Array.isArray(values) ? values : [values]).map(Number).filter(Number.isInteger)
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, row.id ?? 0), 0) + 1
}

/** Search/sort/paginate in memory, mirroring the mysql listing behavior. */
async function page(rows, args, { searchKeys, sortMap }) {
  const limit = await pageLimit(args.limit, 50)
  const offset = Number.isInteger(args.offset) ? args.offset : 0
  const total = rows.length

  const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''
  if (search !== '') {
    rows = rows.filter((row) =>
      searchKeys.some((key) => {
        const value = String(row[key] ?? '').toLowerCase()
        return args.exact_match === true ? value === search : value.includes(search)
      }),
    )
  }

  // LIKE treats % and _ as wildcards; here they match literally
  const filteredCount = rows.length

  const sortBy = sortMap[args.sort_by] ?? sortMap.timestamp
  const dir = args.sort_dir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    if (a[sortBy] < b[sortBy]) return -dir
    if (a[sortBy] > b[sortBy]) return dir
    return (b.id ?? 0) - (a.id ?? 0) // stable pagination tiebreak, as in sql
  })

  return { rows: rows.slice(offset, offset + limit), total, filtered: filteredCount, limit, offset }
}

export default AuditRepoFile
