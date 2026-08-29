import { createHash } from 'node:crypto'

import Mysql from '../../mysql.js'
import ZoneBase, { canonicalZoneName, ZoneNameConflictError } from './base.js'
import { mapToDbColumn } from '../../util.js'

const zoneDbMap = { id: 'nt_zone_id', gid: 'nt_group_id' }
const boolFields = ['deleted']

function zoneLockName(zone) {
  const digest = createHash('sha256').update(canonicalZoneName(zone)).digest('hex')
  return `ntz:${digest.slice(0, 60)}`
}

async function assertZoneNameAvailable(db, zone, excludeId) {
  let query = `SELECT nt_zone_id AS id FROM nt_zone
    WHERE deleted = 0 AND LOWER(TRIM(TRAILING '.' FROM zone)) = ?`
  const params = [canonicalZoneName(zone)]
  if (excludeId !== undefined) {
    query += ' AND nt_zone_id <> ?'
    params.push(excludeId)
  }
  query += ' LIMIT 1'
  if ((await db.execute(query, params)).length > 0) throw new ZoneNameConflictError(zone)
}

async function withZoneNameLock(zone, fn) {
  return Mysql.transaction(async (tx) => {
    const [lock] = await tx.execute('SELECT GET_LOCK(?, 10) AS acquired', [zoneLockName(zone)])
    if (lock.acquired !== 1) throw new Error(`Could not lock zone name: ${zone}`)
    return fn(tx)
  })
}

function applyAccessScope(query, params, gidScope, accessibleIds) {
  if (gidScope === undefined) return [query, params]
  const gidList = Array.isArray(gidScope) ? gidScope : [gidScope]
  const connector = /\bWHERE\b/.test(query) ? ' AND' : ' WHERE'
  const gidPlaceholders = gidList.map(() => '?').join(', ')
  let clause = `nt_group_id IN (${gidPlaceholders || 'NULL'})`
  const nextParams = [...params, ...gidList]
  if (accessibleIds?.length) {
    clause = `(${clause} OR nt_zone_id IN (${accessibleIds.map(() => '?').join(', ')}))`
    nextParams.push(...accessibleIds)
  }
  return [`${query}${connector} ${clause}`, nextParams]
}

function applyZoneFilters(query, params, filters = {}) {
  let nextQuery = query
  const nextParams = [...params]

  const append = (sql) => {
    nextQuery += `${/\bWHERE\b/.test(nextQuery) ? ' AND' : ' WHERE'} ${sql}`
  }

  const search = typeof filters.search === 'string' ? filters.search.trim() : ''
  if (search) {
    append('(zone LIKE ? OR description LIKE ?)')
    const wildcard = `%${search}%`
    nextParams.push(wildcard, wildcard)
  }

  const zoneLike = typeof filters.zone_like === 'string' ? filters.zone_like.trim() : ''
  if (zoneLike) {
    append('zone LIKE ?')
    nextParams.push(`%${zoneLike}%`)
  }

  const descriptionLike = typeof filters.description_like === 'string' ? filters.description_like.trim() : ''
  if (descriptionLike) {
    append('description LIKE ?')
    nextParams.push(`%${descriptionLike}%`)
  }

  return [nextQuery, nextParams]
}

class ZoneRepoMySQL extends ZoneBase {
  constructor(args = {}) {
    super(args)
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    const { nameservers, ...zone } = args

    return withZoneNameLock(zone.zone, async (tx) => {
      if (zone.deleted !== true) await assertZoneNameAvailable(tx, zone.zone)
      const insertId = await tx.execute(...tx.insert(`nt_zone`, mapToDbColumn(zone, zoneDbMap)))
      // an explicit-id insert can report insertId 0 (see the group store),
      // and id 0 in the payload means auto-increment
      const id = zone.id || insertId
      if (Array.isArray(nameservers)) await this.setNameservers(id, nameservers, tx)
      return id
    })
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    args.deleted = args.deleted ?? false

    const gidScope = args.gid
    delete args.gid
    const accessibleIds = args.accessible_ids
    delete args.accessible_ids

    const filters = {
      search: args.search,
      zone_like: args.zone_like,
      description_like: args.description_like,
    }
    delete args.search
    delete args.zone_like
    delete args.description_like

    const sortByMap = {
      id: 'nt_zone_id',
      zone: 'zone',
      description: 'description',
      last_modified: 'last_modified',
    }
    const sortBy = sortByMap[args.sort_by] ?? 'zone'
    const sortDir = args.sort_dir === 'desc' ? 'DESC' : 'ASC'
    delete args.sort_by
    delete args.sort_dir

    const limit = Number.isInteger(args.limit) ? args.limit : undefined
    delete args.limit
    const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset) : 0
    delete args.offset

    const sqlLimit = limit === undefined ? '' : ` LIMIT ${Math.max(1, limit)} OFFSET ${offset}`

    const [query, params] = Mysql.select(
      `SELECT nt_zone_id AS id
        , nt_group_id AS gid
        , zone
        , mailaddr
        , description
        , serial
        , refresh
        , retry
        , expire
        , minimum
        , ttl
        , last_modified
        , last_publish
        , deleted
      FROM nt_zone`,
      mapToDbColumn(args, zoneDbMap),
    )

    let [finalQuery, finalParams] = applyZoneFilters(query, params, filters)
    ;[finalQuery, finalParams] = applyAccessScope(finalQuery, finalParams, gidScope, accessibleIds)
    finalQuery += ` ORDER BY ${sortBy} ${sortDir}`

    const rows = await Mysql.execute(`${finalQuery}${sqlLimit}`, finalParams)
    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      for (const f of ['description', 'location']) {
        if ([null].includes(row[f])) row[f] = ''
      }

      // Coerce legacy DB NULLs to sane defaults so responses validate
      const zoneDefaults = {
        minimum: 3600,
        ttl: 3600,
        refresh: 86400,
        retry: 7200,
        expire: 1209600,
      }
      for (const [f, val] of Object.entries(zoneDefaults)) {
        if ([null, undefined].includes(row[f])) row[f] = val
      }

      if ([null, undefined].includes(row.serial)) row.serial = 0

      if (row['last_publish'] === undefined) delete row['last_publish']
      if (/00:00:00/.test(row['last_publish'])) row['last_publish'] = null
      if (args.deleted === false) delete row.deleted
    }

    return rows
  }

  async count(args = {}) {
    args = JSON.parse(JSON.stringify(args))
    args.deleted = args.deleted ?? false

    const gidScope = args.gid
    delete args.gid
    const accessibleIds = args.accessible_ids
    delete args.accessible_ids

    const filters = {
      search: args.search,
      zone_like: args.zone_like,
      description_like: args.description_like,
    }
    delete args.search
    delete args.zone_like
    delete args.description_like

    const [query, params] = Mysql.select(
      `SELECT COUNT(*) AS total
      FROM nt_zone`,
      mapToDbColumn(args, zoneDbMap),
    )

    let [finalQuery, finalParams] = applyZoneFilters(query, params, filters)
    ;[finalQuery, finalParams] = applyAccessScope(finalQuery, finalParams, gidScope, accessibleIds)
    const rows = await Mysql.execute(finalQuery, finalParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id

    const nameservers = args.nameservers
    delete args.nameservers

    if (Object.keys(args).length === 0) {
      if (!Array.isArray(nameservers)) return false
      await Mysql.transaction((tx) => this.setNameservers(id, nameservers, tx))
      return true
    }

    if (args.deleted === false) {
      const rows = await Mysql.execute('SELECT zone FROM nt_zone WHERE nt_zone_id = ? LIMIT 1', [id])
      if (rows.length === 0) return false
      return withZoneNameLock(rows[0].zone, async (tx) => {
        await assertZoneNameAvailable(tx, rows[0].zone, id)
        const r = await tx.execute(
          ...tx.update(`nt_zone`, `nt_zone_id=${id}`, mapToDbColumn(args, zoneDbMap)),
        )
        if (Array.isArray(nameservers)) await this.setNameservers(id, nameservers, tx)
        return r.changedRows === 1
      })
    }

    if (Array.isArray(nameservers)) {
      return Mysql.transaction(async (tx) => {
        const r = await tx.execute(
          ...tx.update(`nt_zone`, `nt_zone_id=${id}`, mapToDbColumn(args, zoneDbMap)),
        )
        await this.setNameservers(id, nameservers, tx)
        return r.affectedRows === 1
      })
    }

    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone`, `nt_zone_id=${id}`, mapToDbColumn(args, zoneDbMap)),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone`, `nt_zone_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    // no foreign key cleans the assignments up
    await Mysql.execute('DELETE FROM nt_zone_nameserver WHERE nt_zone_id = ?', [args.id])
    const r = await Mysql.execute(...Mysql.delete(`nt_zone`, { nt_zone_id: args.id }))
    return r.affectedRows === 1
  }

  async nameserverIds(zid) {
    const rows = await Mysql.execute(
      'SELECT nt_nameserver_id AS id FROM nt_zone_nameserver WHERE nt_zone_id = ? ORDER BY nt_nameserver_id',
      [zid],
    )
    return rows.map((r) => r.id)
  }

  async setNameservers(zid, ids, db = Mysql) {
    await db.execute('DELETE FROM nt_zone_nameserver WHERE nt_zone_id = ?', [zid])
    for (const nid of new Set(ids.map(Number))) {
      await db.execute('INSERT INTO nt_zone_nameserver (nt_zone_id, nt_nameserver_id) VALUES (?, ?)', [
        zid,
        nid,
      ])
    }
    return true
  }

  disconnect() {
    return this.mysql?.disconnect()
  }

  async nameserversFor(zid) {
    return Mysql.execute(
      `SELECT z.zone, n.name, n.ttl
         FROM nt_zone_nameserver nzns
         JOIN nt_nameserver n ON n.nt_nameserver_id = nzns.nt_nameserver_id
         JOIN nt_zone z       ON z.nt_zone_id       = nzns.nt_zone_id
        WHERE nzns.nt_zone_id = ?
        ORDER BY n.name`,
      [zid],
    )
  }
}

export { zoneLockName }
export default ZoneRepoMySQL
