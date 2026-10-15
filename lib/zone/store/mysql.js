import { createHash } from 'node:crypto'

import Mysql from '../../mysql.js'
import ZoneBase, { canonicalZoneName, withCanonicalZone, zoneNameConflict } from './base.js'
import { idConflict } from '../../store/error.js'
import { mapToDbColumn } from '../../util.js'

const zoneDbMap = { id: 'nt_zone_id', gid: 'nt_group_id' }
const boolFields = ['deleted']

// include_subgroups passes gid as a list of group ids; filter with IN(...).
function applyGidList(query, params, gidList) {
  if (!gidList) return [query, params]
  const connector = /\bWHERE\b/.test(query) ? ' AND' : ' WHERE'
  if (gidList.length === 0) return [`${query}${connector} nt_group_id IN (NULL)`, params]
  const placeholders = gidList.map(() => '?').join(', ')
  return [`${query}${connector} nt_group_id IN (${placeholders})`, [...params, ...gidList]]
}

function applyZoneFilters(query, params, filters = {}) {
  let nextQuery = query
  const nextParams = [...params]

  const append = (sql) => {
    nextQuery += `${/\bWHERE\b/.test(nextQuery) ? ' AND' : ' WHERE'} ${sql}`
  }

  if (filters.zone !== undefined) {
    append(`${STORED_NAME} = ?`)
    nextParams.push(canonicalZoneName(filters.zone))
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

// v2 strips the trailing dot but keeps the case it was given
const STORED_NAME = 'LOWER(zone)'

function zoneLockName(zone) {
  const digest = createHash('sha256').update(canonicalZoneName(zone)).digest('hex')
  return `ntz:${digest.slice(0, 60)}`
}

async function assertZoneNameAvailable(db, zone, excludeId) {
  let query = `SELECT nt_zone_id AS id FROM nt_zone
    WHERE deleted = 0 AND ${STORED_NAME} = ?`
  const params = [canonicalZoneName(zone)]
  if (excludeId !== undefined) {
    query += ' AND nt_zone_id <> ?'
    params.push(excludeId)
  }
  if ((await db.execute(`${query} LIMIT 1`, params)).length > 0) throw zoneNameConflict(zone)
}

function isTrue(value) {
  return value === true || value === 1
}

// GET_LOCK serialises writers of one name; the transaction alone can't, as
// neither sees the other's uncommitted row.
async function lockZoneName(tx, zone) {
  const [lock] = await tx.execute('SELECT GET_LOCK(?, 10) AS acquired', [zoneLockName(zone)])
  if (lock.acquired !== 1) throw new Error(`could not lock zone name ${zone}`)
}

class ZoneRepoMySQL extends ZoneBase {
  constructor(args = {}) {
    super(args)
    this.mysql = Mysql
  }

  async create(args, options) {
    args = withCanonicalZone(args)
    if (args.id !== undefined) {
      const g = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (g.length > 0) return idConflict('zone', args.id, options)
    }

    const insert = Mysql.insert(`nt_zone`, mapToDbColumn(args, zoneDbMap))
    if (isTrue(args.deleted)) return Mysql.execute(...insert)
    return Mysql.transaction(async (tx) => {
      await lockZoneName(tx, args.zone)
      await assertZoneNameAvailable(tx, args.zone)
      return tx.execute(...insert)
    })
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    args.deleted = args.deleted ?? false

    const gidList = Array.isArray(args.gid) ? args.gid : null
    if (gidList) delete args.gid

    const filters = {
      zone: args.zone,
      search: args.search,
      zone_like: args.zone_like,
      description_like: args.description_like,
    }
    delete args.zone
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
    ;[finalQuery, finalParams] = applyGidList(finalQuery, finalParams, gidList)
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

    const gidList = Array.isArray(args.gid) ? args.gid : null
    if (gidList) delete args.gid

    const filters = {
      zone: args.zone,
      search: args.search,
      zone_like: args.zone_like,
      description_like: args.description_like,
    }
    delete args.zone
    delete args.search
    delete args.zone_like
    delete args.description_like

    const [query, params] = Mysql.select(
      `SELECT COUNT(*) AS total
      FROM nt_zone`,
      mapToDbColumn(args, zoneDbMap),
    )

    let [finalQuery, finalParams] = applyZoneFilters(query, params, filters)
    ;[finalQuery, finalParams] = applyGidList(finalQuery, finalParams, gidList)
    const rows = await Mysql.execute(finalQuery, finalParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    args = withCanonicalZone({ ...args })
    const id = args.id
    delete args.id
    const update = Mysql.update(`nt_zone`, `nt_zone_id=${id}`, mapToDbColumn(args, zoneDbMap))

    const deleted = args.deleted === undefined ? undefined : isTrue(args.deleted)
    if (args.zone === undefined && deleted !== false) {
      const r = await Mysql.execute(...update)
      return r.changedRows === 1
    }

    // the row lock keeps a concurrent rename or restore from changing the
    // name or state this check is about
    return Mysql.transaction(async (tx) => {
      const [row] = await tx.execute('SELECT zone, deleted FROM nt_zone WHERE nt_zone_id = ? FOR UPDATE', [
        id,
      ])
      if (!row) return false
      const zone = args.zone ?? row.zone
      const live = !(deleted ?? Boolean(row.deleted))
      if (live && (args.zone !== undefined || Boolean(row.deleted))) {
        await lockZoneName(tx, zone)
        await assertZoneNameAvailable(tx, zone, id)
      }
      const r = await tx.execute(...update)
      return r.changedRows === 1
    })
  }

  async delete(args) {
    if (args.deleted === false || args.deleted === 0) return this.put({ id: args.id, deleted: false })
    const r = await Mysql.execute(
      ...Mysql.update(`nt_zone`, `nt_zone_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(...Mysql.delete(`nt_zone`, { nt_zone_id: args.id }))
    return r.affectedRows === 1
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
