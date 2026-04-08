import Mysql from '../mysql.js'
import ZoneBase from './zoneBase.js'
import { mapToDbColumn } from '../util.js'

const zoneDbMap = { id: 'nt_zone_id', gid: 'nt_group_id' }
const boolFields = ['deleted']

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

    return await Mysql.execute(...Mysql.insert(`nt_zone`, mapToDbColumn(args, zoneDbMap)))
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    args.deleted = args.deleted ?? false

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

    const [finalQuery, finalParams] = applyZoneFilters(query, params, filters)
    const rows = await Mysql.execute(finalQuery, finalParams)
    return rows?.[0]?.total ?? 0
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
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
    const r = await Mysql.execute(...Mysql.delete(`nt_zone`, { nt_zone_id: args.id }))
    return r.affectedRows === 1
  }
}

export default ZoneRepoMySQL
