import * as RR from '@nictool/dns-resource-record'

import Mysql from '../../mysql.js'
import { pageLimit } from '../../page.js'

import AuditBase from './base.js'

class AuditRepoMysql extends AuditBase {
  async insertZoneLog(detail) {
    return Mysql.execute(...Mysql.insert('nt_zone_log', mapZone(detail)))
  }

  async insertZoneRecordLog(detail) {
    return Mysql.execute(...Mysql.insert('nt_zone_record_log', mapRecord(detail)))
  }

  async insertGlobalLog({ uid, timestamp, action, object, objectId, logId, title, description }) {
    return Mysql.execute(
      ...Mysql.insert('nt_user_global_log', {
        nt_user_id: uid,
        timestamp,
        action,
        object,
        object_id: objectId,
        log_entry_id: logId,
        title,
        description,
      }),
    )
  }

  async listGlobal(args) {
    const scope = groupScope('u.nt_group_id', args.gids)
    const where = Number.isInteger(args.uid) ? `${scope.sql} AND gl.nt_user_id = ?` : scope.sql
    const params = Number.isInteger(args.uid) ? [...scope.params, args.uid] : scope.params
    return listRows({
      select: `SELECT gl.nt_user_global_log_id AS id,
        gl.nt_user_id AS uid, u.nt_group_id AS gid, g.name AS group_name,
        gl.timestamp, gl.action, gl.object, gl.object_id, gl.target,
        gl.target_id, gl.target_name, gl.log_entry_id, gl.title, gl.description,
        CONCAT(u.first_name, ' ', u.last_name, ' (', u.username, ')') AS user`,
      from: `FROM nt_user_global_log gl
        JOIN nt_user u ON u.nt_user_id = gl.nt_user_id
        JOIN nt_group g ON g.nt_group_id = u.nt_group_id`,
      where,
      params,
      searchColumns: ['u.username', 'gl.action', 'gl.object', 'gl.title', 'gl.description'],
      sortMap: {
        timestamp: 'gl.timestamp',
        user: 'u.username',
        action: 'gl.action',
        object: 'gl.object',
        title: 'gl.title',
        description: 'gl.description',
        group_name: 'g.name',
      },
      args,
    })
  }

  async listZones(args) {
    const scope = groupScope('zl.nt_group_id', args.gids)
    return listRows({
      select: `SELECT zl.nt_zone_log_id AS id, zl.nt_group_id AS gid,
        zl.nt_user_id AS uid, zl.nt_zone_id AS zid, zl.timestamp, zl.action,
        zl.zone, zl.mailaddr, zl.description, zl.serial, zl.refresh, zl.retry,
        zl.expire, zl.minimum, zl.ttl, zl.location, g.name AS group_name,
        CONCAT(u.first_name, ' ', u.last_name, ' (', u.username, ')') AS user`,
      from: `FROM nt_zone_log zl
        JOIN nt_user u ON u.nt_user_id = zl.nt_user_id
        JOIN nt_group g ON g.nt_group_id = zl.nt_group_id`,
      where: scope.sql,
      params: scope.params,
      searchColumns: ['zl.zone', 'zl.description', 'zl.action', 'u.username', 'g.name'],
      sortMap: {
        timestamp: 'zl.timestamp',
        user: 'u.username',
        action: 'zl.action',
        zone: 'zl.zone',
        ttl: 'zl.ttl',
        description: 'zl.description',
        group_name: 'g.name',
      },
      args,
    })
  }

  async listZoneRecords(args) {
    let where = Number.isInteger(args.id)
      ? 'rl.nt_zone_id = ? AND rl.nt_zone_record_log_id = ?'
      : 'rl.nt_zone_id = ?'
    const params = Number.isInteger(args.id) ? [args.zid, args.id] : [args.zid]
    if (Array.isArray(args.ids)) {
      where += args.ids.length
        ? ` AND rl.nt_zone_record_id IN (${args.ids.map(() => '?').join(', ')})`
        : ' AND 0'
      params.push(...args.ids)
    }
    return listRows({
      select: `SELECT rl.nt_zone_record_log_id AS id, rl.nt_zone_id AS zid,
        rl.nt_user_id AS uid, rl.nt_zone_record_id AS zrid, rl.timestamp,
        rl.action, rl.name AS owner, rl.ttl, rl.description, rt.name AS type,
        rl.address, rl.weight, rl.priority, rl.other, rl.location,
        CONCAT(u.first_name, ' ', u.last_name, ' (', u.username, ')') AS user`,
      from: `FROM nt_zone_record_log rl
        JOIN nt_user u ON u.nt_user_id = rl.nt_user_id
        JOIN nt_group g ON g.nt_group_id = u.nt_group_id
        JOIN resource_record_type rt ON rt.id = rl.type_id`,
      where,
      params,
      searchColumns: ['rl.name', 'rl.description', 'rt.name', 'rl.address', 'rl.action', 'u.username'],
      sortMap: {
        timestamp: 'rl.timestamp',
        user: 'u.username',
        action: 'rl.action',
        owner: 'rl.name',
        type: 'rt.name',
        address: 'rl.address',
        ttl: 'rl.ttl',
        weight: 'rl.weight',
        description: 'rl.description',
      },
      args,
    })
  }

  async destroyByUser(uid) {
    let removed = false
    for (const table of ['nt_zone_log', 'nt_zone_record_log', 'nt_user_global_log']) {
      const result = await Mysql.execute(...Mysql.delete(table, { nt_user_id: uid }))
      removed ||= result.affectedRows > 0
    }
    return removed
  }
}

function mapZone(detail) {
  const { gid, zid, uid, ...rest } = detail
  return { nt_group_id: gid, nt_zone_id: zid, nt_user_id: uid, ...rest }
}

function mapRecord(detail) {
  const { owner, ...rest } = detail
  const detailOut = { name: owner, ...rest }
  if (detailOut.type !== undefined) detailOut.type_id = RR.typeMap[detailOut.type]
  delete detailOut.type
  const { zid, zrid, uid, ...cols } = detailOut
  return { nt_zone_id: zid, nt_zone_record_id: zrid, nt_user_id: uid, ...cols }
}

async function listRows({ select, from, where, params, searchColumns, sortMap, args }) {
  const limit = await pageLimit(args.limit, 50)
  const offset = Number.isInteger(args.offset) ? args.offset : 0
  const total = await countRows(from, where, params)

  let filteredWhere = where
  const filteredParams = [...params]
  const search = typeof args.search === 'string' ? args.search.trim() : ''
  if (search) {
    const op = args.exact_match === true ? '= ?' : 'LIKE ?'
    filteredWhere += ` AND (${searchColumns.map((column) => `${column} ${op}`).join(' OR ')})`
    const value = args.exact_match === true ? search : `%${search}%`
    filteredParams.push(...searchColumns.map(() => value))
  }

  const filtered = search ? await countRows(from, filteredWhere, filteredParams) : total
  const sortBy = sortMap[args.sort_by] ?? sortMap.timestamp
  const sortDir = args.sort_dir === 'asc' ? 'ASC' : 'DESC'
  const rows = await Mysql.execute(
    `${select} ${from} WHERE ${filteredWhere}
      ORDER BY ${sortBy} ${sortDir}, id DESC LIMIT ${limit} OFFSET ${offset}`,
    filteredParams,
  )
  return { rows, total, filtered, limit, offset }
}

async function countRows(from, where, params) {
  const rows = await Mysql.execute(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params)
  return rows[0].total
}

function groupScope(column, gids) {
  const values = (Array.isArray(gids) ? gids : [gids]).map(Number).filter(Number.isInteger)
  if (values.length === 0) return { sql: '1 = 0', params: [] }
  return {
    sql: `${column} IN (${values.map(() => '?').join(', ')})`,
    params: values,
  }
}

export default AuditRepoMysql
