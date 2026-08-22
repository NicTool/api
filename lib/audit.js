import * as RR from '@nictool/dns-resource-record'

import Mysql from './mysql.js'

const actionDescription = {
  added: 'initial creation',
  deleted: 'deleted',
  modified: 'modified',
  moved: 'moved',
  recovered: 'recovered',
}

class Audit {
  async logZone(actor, action, zone, previous = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const detail = compact({
      nt_group_id: zone.gid,
      nt_zone_id: zone.id,
      nt_user_id: actor.id,
      action,
      timestamp,
      zone: zone.zone,
      mailaddr: zone.mailaddr,
      description: zone.description,
      refresh: zone.refresh,
      retry: zone.retry,
      expire: zone.expire,
      ttl: zone.ttl,
      minimum: zone.minimum,
      serial: zone.serial,
    })
    const logId = await Mysql.execute(...Mysql.insert('nt_zone_log', detail))
    await this.logGlobal({
      uid: actor.id,
      timestamp,
      action,
      object: 'zone',
      objectId: zone.id,
      logId,
      title: zone.zone,
      description: describe(action, 'zone', zone, previous),
    })
    return logId
  }

  async logZoneRecord(actor, action, record, zone, previous = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const detail = compact({
      nt_zone_id: record.zid,
      nt_zone_record_id: record.id,
      nt_user_id: actor.id,
      action,
      timestamp,
      name: record.owner,
      ttl: record.ttl,
      description: record.description,
      type_id: RR.typeMap[record.type],
      address: record.address,
      weight: record.weight,
      priority: record.priority,
      other: record.other,
      location: record.location,
    })
    const logId = await Mysql.execute(...Mysql.insert('nt_zone_record_log', detail))
    await this.logGlobal({
      uid: actor.id,
      timestamp,
      action,
      object: 'zone_record',
      objectId: record.id,
      logId,
      title: record.owner,
      description: describe(action, 'record', record, previous, zone),
    })
    return logId
  }

  async logGlobal({ uid, timestamp, action, object, objectId, logId, title, description }) {
    return Mysql.execute(...Mysql.insert('nt_user_global_log', {
      nt_user_id: uid,
      timestamp,
      action,
      object,
      object_id: objectId,
      log_entry_id: logId,
      title,
      description,
    }))
  }

  async listGlobal(args) {
    const scope = groupScope('u.nt_group_id', args.gids)
    const where = Number.isInteger(args.uid)
      ? `${scope.sql} AND gl.nt_user_id = ?`
      : scope.sql
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
        timestamp: 'gl.timestamp', user: 'u.username', action: 'gl.action',
        object: 'gl.object', title: 'gl.title', description: 'gl.description',
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
        timestamp: 'zl.timestamp', user: 'u.username', action: 'zl.action',
        zone: 'zl.zone', ttl: 'zl.ttl', description: 'zl.description', group_name: 'g.name',
      },
      args,
    })
  }

  async listZoneRecords(args) {
    const where = Number.isInteger(args.id)
      ? 'rl.nt_zone_id = ? AND rl.nt_zone_record_log_id = ?'
      : 'rl.nt_zone_id = ?'
    const params = Number.isInteger(args.id) ? [args.zid, args.id] : [args.zid]
    return listRows({
      select: `SELECT rl.nt_zone_record_log_id AS id, rl.nt_zone_id AS zid,
        rl.nt_user_id AS uid, rl.nt_zone_record_id AS zrid, rl.timestamp,
        rl.action, rl.name AS owner, rl.ttl, rl.description, rt.name AS type,
        rl.address, rl.weight, rl.priority, rl.other, rl.location,
        CONCAT(u.first_name, ' ', u.last_name, ' (', u.username, ')') AS user`,
      from: `FROM nt_zone_record_log rl
        JOIN nt_user u ON u.nt_user_id = rl.nt_user_id
        JOIN resource_record_type rt ON rt.id = rl.type_id`,
      where,
      params,
      searchColumns: [
        'rl.name', 'rl.description', 'rt.name', 'rl.address', 'rl.action', 'u.username',
      ],
      sortMap: {
        timestamp: 'rl.timestamp', user: 'u.username', action: 'rl.action',
        owner: 'rl.name', type: 'rt.name', address: 'rl.address', ttl: 'rl.ttl',
        weight: 'rl.weight', description: 'rl.description',
      },
      args,
    })
  }
}

async function listRows({ select, from, where, params, searchColumns, sortMap, args }) {
  const limit = Number.isInteger(args.limit) ? args.limit : 50
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

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
}

function describe(action, object, current, previous, zone) {
  if (action === 'moved') return `moved from group ${previous.gid} to ${current.gid}`
  if (action === 'deleted' && object === 'record') return `deleted record from ${zone.zone}`
  if (action === 'recovered' && object === 'record') return `recovered ${current.type} record`
  return `${actionDescription[action] ?? action} ${object}`
}

export default new Audit()
