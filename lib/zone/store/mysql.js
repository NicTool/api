import Mysql from '../../mysql.js'
import ZoneBase, { sortNameservers } from './base.js'
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

  async create(args, options) {
    if (args.id !== undefined) {
      const g = [...(await this.get({ id: args.id })), ...(await this.get({ id: args.id, deleted: true }))]
      if (g.length > 0) return idConflict('zone', args.id, options)
    }

    const { nameservers, ...zone } = args
    const insert = Mysql.insert(`nt_zone`, mapToDbColumn(zone, zoneDbMap))
    if (!nameservers?.length) return Mysql.execute(...insert)
    return Mysql.transaction(async (tx) => {
      const id = await tx.execute(...insert)
      await this._setNameservers(tx, id, nameservers)
      return id
    })
  }

  async _nameserverIds(zids, db = Mysql) {
    const byZone = new Map(zids.map((zid) => [zid, []]))
    if (zids.length === 0) return byZone
    const rows = await db.execute(
      `SELECT nt_zone_id, nt_nameserver_id FROM nt_zone_nameserver
        WHERE nt_zone_id IN (${zids.map(() => '?').join(',')})
        ORDER BY nt_nameserver_id`,
      zids,
    )
    for (const row of rows) byZone.get(row.nt_zone_id).push(row.nt_nameserver_id)
    return byZone
  }

  async _setNameservers(db, zid, nameservers) {
    await db.execute('DELETE FROM nt_zone_nameserver WHERE nt_zone_id = ?', [zid])
    const ids = sortNameservers(nameservers)
    if (ids.length === 0) return
    await db.execute(
      `INSERT INTO nt_zone_nameserver (nt_zone_id, nt_nameserver_id) VALUES ${ids.map(() => '(?,?)').join(',')}`,
      ids.flatMap((nsid) => [zid, nsid]),
    )
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    args.deleted = args.deleted ?? false

    const gidList = Array.isArray(args.gid) ? args.gid : null
    if (gidList) delete args.gid

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
    ;[finalQuery, finalParams] = applyGidList(finalQuery, finalParams, gidList)
    finalQuery += ` ORDER BY ${sortBy} ${sortDir}`

    const rows = await Mysql.execute(`${finalQuery}${sqlLimit}`, finalParams)
    const nameservers = await this._nameserverIds(rows.map((row) => row.id))
    for (const row of rows) {
      row.nameservers = nameservers.get(row.id)
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
    ;[finalQuery, finalParams] = applyGidList(finalQuery, finalParams, gidList)
    const rows = await Mysql.execute(finalQuery, finalParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    const { id, nameservers, ...changes } = args
    const update = Object.keys(changes).length
      ? Mysql.update(`nt_zone`, `nt_zone_id=${id}`, mapToDbColumn(changes, zoneDbMap))
      : undefined

    if (nameservers === undefined) {
      if (!update) return false
      const r = await Mysql.execute(...update)
      return r.changedRows === 1
    }

    // The row lock serialises replacements of one zone's set, which would
    // otherwise interleave their DELETEs and INSERTs and leave the union.
    // nt_zone_nameserver has no foreign key, so the lock's read is also what
    // keeps a missing zone from gaining assignments.
    return Mysql.transaction(async (tx) => {
      const [zone] = await tx.execute('SELECT nt_zone_id FROM nt_zone WHERE nt_zone_id = ? FOR UPDATE', [id])
      if (!zone) return false

      let changed = false
      if (update) changed = (await tx.execute(...update)).changedRows === 1
      const before = (await this._nameserverIds([id], tx)).get(id)
      if (before.join() !== sortNameservers(nameservers).join()) {
        await this._setNameservers(tx, id, nameservers)
        changed = true
      }
      return changed
    })
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
    // nt_zone_nameserver has no foreign key to cascade from nt_zone
    await Mysql.execute('DELETE FROM nt_zone_nameserver WHERE nt_zone_id = ?', [args.id])
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
        WHERE nzns.nt_zone_id = ? AND n.deleted = 0
        ORDER BY n.nt_nameserver_id`,
      [zid],
    )
  }
}

export default ZoneRepoMySQL
