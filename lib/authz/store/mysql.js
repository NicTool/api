import Mysql from '../../mysql.js'

import AuthzBase from './base.js'

const RESOURCE_QUERIES = {
  zone: 'SELECT nt_group_id FROM nt_zone WHERE nt_zone_id = ?',
  zonerecord: `SELECT z.nt_group_id FROM nt_zone_record r
    JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
    WHERE r.nt_zone_record_id = ?`,
  user: 'SELECT nt_group_id FROM nt_user WHERE nt_user_id = ?',
  group: 'SELECT parent_group_id AS nt_group_id FROM nt_group WHERE nt_group_id = ?',
  nameserver: 'SELECT nt_group_id FROM nt_nameserver WHERE nt_nameserver_id = ?',
}

const DELEGATE_TYPE = {
  zone: 'ZONE',
  zonerecord: 'ZONERECORD',
  nameserver: 'NAMESERVER',
  group: 'GROUP',
}

function delegateTable(resource) {
  return {
    zone: 'nt_zone',
    zonerecord: 'nt_zone_record',
    nameserver: 'nt_nameserver',
    group: 'nt_group',
    user: 'nt_user',
  }[resource]
}

function delegateIdColumn(resource) {
  return {
    zone: 'o.nt_zone_id',
    zonerecord: 'o.nt_zone_record_id',
    nameserver: 'o.nt_nameserver_id',
    group: 'o.nt_group_id',
    user: 'o.nt_user_id',
  }[resource]
}

class AuthzRepoMysql extends AuthzBase {
  async getObjectGroupId(resource, objectId) {
    const query = RESOURCE_QUERIES[resource]
    if (!query) return null

    const rows = await Mysql.execute(query, [objectId])
    if (rows.length === 0) return null

    let gid = rows[0].nt_group_id
    if (resource === 'group' && (gid === 0 || gid === null)) gid = 1
    return gid
  }

  async isInGroupTree(userGroupId, targetGroupId) {
    if (userGroupId === targetGroupId) return true

    const rows = await Mysql.execute(
      `SELECT COUNT(*) AS count FROM nt_group_subgroups
       WHERE nt_group_id = ? AND nt_subgroup_id = ?`,
      [userGroupId, targetGroupId],
    )
    return rows[0].count > 0
  }

  async isActiveGroup(groupId) {
    const rows = await Mysql.execute('SELECT 1 FROM nt_group WHERE nt_group_id = ? AND deleted = 0', [
      groupId,
    ])
    return rows.length > 0
  }

  async isActiveObject(resource, objectId) {
    const table = delegateTable(resource)
    const idColumn = delegateIdColumn(resource)?.slice(2)
    if (!table || !idColumn) return false
    const rows = await Mysql.execute(`SELECT 1 FROM ${table} WHERE ${idColumn} = ? AND deleted = 0`, [
      objectId,
    ])
    return rows.length > 0
  }

  async getDirectDelegateAccess(groupId, objectId, resource) {
    const type = DELEGATE_TYPE[resource]
    if (!type) return null
    const rows = await Mysql.execute(
      `SELECT d.* FROM nt_delegate d
       JOIN ${delegateTable(resource)} o ON ${delegateIdColumn(resource)} = d.nt_object_id
       WHERE d.nt_group_id = ? AND d.nt_object_id = ? AND d.nt_object_type = ?
         AND d.deleted = 0 AND o.deleted = 0`,
      [groupId, objectId, type],
    )
    return rows.length > 0 ? rows[0] : null
  }

  async getDelegatedZoneIds(groupIds) {
    const gids = (Array.isArray(groupIds) ? groupIds : [groupIds]).map(Number).filter(Number.isInteger)
    if (gids.length === 0) return []
    const placeholders = gids.map(() => '?').join(', ')
    const rows = await Mysql.execute(
      `SELECT d.nt_object_id AS id
       FROM nt_delegate d
       JOIN nt_zone z ON z.nt_zone_id = d.nt_object_id
       WHERE d.nt_group_id IN (${placeholders})
         AND d.nt_object_type = 'ZONE' AND d.deleted = 0 AND z.deleted = 0
       UNION
       SELECT r.nt_zone_id AS id
       FROM nt_delegate d
       JOIN nt_zone_record r ON r.nt_zone_record_id = d.nt_object_id
       JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
       WHERE d.nt_group_id IN (${placeholders})
         AND d.nt_object_type = 'ZONERECORD'
         AND d.deleted = 0 AND r.deleted = 0 AND z.deleted = 0`,
      [...gids, ...gids],
    )
    return rows.map((row) => row.id)
  }

  async delegatedRecordIdsInZone(groupId, zoneId) {
    const rows = await Mysql.execute(
      `SELECT r.nt_zone_record_id AS id
       FROM nt_delegate d
       JOIN nt_zone_record r ON r.nt_zone_record_id = d.nt_object_id
       JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
       WHERE d.nt_group_id = ? AND r.nt_zone_id = ?
         AND d.nt_object_type = 'ZONERECORD'
         AND d.deleted = 0 AND r.deleted = 0 AND z.deleted = 0`,
      [groupId, zoneId],
    )
    return rows.map((row) => row.id)
  }

  async zoneDelegationForRecord(groupId, zoneRecordId) {
    const rows = await Mysql.execute(
      `SELECT d.*, 1 AS pseudo FROM nt_delegate d
       JOIN nt_zone_record r ON r.nt_zone_id = d.nt_object_id
       JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
       WHERE d.nt_group_id = ?
         AND r.nt_zone_record_id = ?
         AND d.nt_object_type = 'ZONE'
         AND d.deleted = 0 AND r.deleted = 0 AND z.deleted = 0`,
      [groupId, zoneRecordId],
    )
    return rows.length > 0 ? rows[0] : null
  }

  async liveSessionGroup(userId, sessionId, oldestSec) {
    const rows = await Mysql.execute(
      `SELECT u.nt_group_id AS gid
       FROM nt_user u
       JOIN nt_group g ON g.nt_group_id = u.nt_group_id
       JOIN nt_user_session s ON s.nt_user_id = u.nt_user_id
       WHERE u.nt_user_id = ? AND s.nt_user_session_id = ?
         AND u.deleted = 0 AND g.deleted = 0
         AND s.last_access >= ?`,
      [userId, sessionId, oldestSec],
    )
    return rows.length === 0 ? null : rows[0].gid
  }

  async permissionRecord(permissionId) {
    const rows = await Mysql.execute(
      `SELECT NULLIF(p.nt_user_id, 0) AS uid,
              NULLIF(p.nt_group_id, 0) AS gid,
              COALESCE(u.nt_group_id, NULLIF(p.nt_group_id, 0)) AS target_gid
       FROM nt_perm p
       LEFT JOIN nt_user u ON u.nt_user_id = p.nt_user_id
       WHERE p.nt_perm_id = ?`,
      [permissionId],
    )
    return rows.length === 0 ? null : rows[0]
  }
}

export default AuthzRepoMysql
