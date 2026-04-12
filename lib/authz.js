import Mysql from './mysql.js'
import Permission from './permission/index.js'

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

const PERM_FIELDS = [
  'group_write', 'group_create', 'group_delete',
  'zone_write', 'zone_create', 'zone_delegate', 'zone_delete',
  'zonerecord_write', 'zonerecord_create', 'zonerecord_delegate', 'zonerecord_delete',
  'user_write', 'user_create', 'user_delete',
  'nameserver_write', 'nameserver_create', 'nameserver_delete',
]

const CREATE_REQUIRES_GROUP = new Set([
  'group', 'nameserver', 'user', 'zone', 'zonerecord',
])

const ACTION_PERMISSION = {
  editDelegation: 'delegate',
  deleteDelegation: 'delegate',
}

const SESSION_MAX_AGE_SEC = 14400

class Authz {
  async checkPermission(credentials, resource, action, objectId, opts) {
    const perm = await Permission.getEffective(credentials.user.id)
    if (!perm) return deny(`No permissions found`)

    if (action === 'create') {
      if (perm[resource]?.create !== true) {
        return deny(`Not allowed to create new ${resource}`)
      }
      const targetGid = opts?.targetGroupId
      if (targetGid === undefined || targetGid === null) {
        if (CREATE_REQUIRES_GROUP.has(resource)) {
          return deny(`No target group found for new ${resource}`)
        }
      } else {
        if (!await this.isActiveGroup(targetGid)) {
          return deny(`No active target group found for new ${resource}`)
        }
        const inTree = await this.isInGroupTree(
          credentials.group.id, targetGid,
        )
        if (!inTree) {
          if (resource === 'zonerecord' && opts?.targetZoneId) {
            const delegation = await this.getDelegateAccess(
              credentials.group.id, opts.targetZoneId, 'zone',
            )
            if (delegation?.zone_perm_add_records === 1) return allow()
            if (delegation) {
              return deny(`Not allowed to add records to the delegated zone.`)
            }
          }
          return deny(
            `No Access Allowed to that object`
            + ` (${DELEGATE_TYPE[resource] ?? 'GROUP'} : ${targetGid})`,
          )
        }
      }
      return allow()
    }

    if (resource === 'user' && objectId === credentials.user.id) {
      if (action === 'delete') return deny(`Not allowed to delete self`)
      if (action === 'write') {
        if (perm.self_write !== true) return deny(`Not allowed to modify self`)
        return allow()
      }
      return allow()
    }

    if (resource === 'group' && objectId === credentials.group.id) {
      if (action === 'write') return deny(`Not allowed to edit your own group`)
      if (action === 'delete') return deny(`Not allowed to delete your own group`)
      if (action === 'read') return allow()
    }

    if (
      resource === 'nameserver'
      && action === 'read'
      && await this.isActiveObject(resource, objectId)
    ) {
      return allow()
    }

    if (
      ['delegate', 'editDelegation', 'deleteDelegation'].includes(action)
      && !await this.isActiveObject(resource, objectId)
    ) {
      return deny(`Cannot change delegation for a deleted object`)
    }

    const objGroupId = await this.getObjectGroupId(resource, objectId)
    if (objGroupId === null) {
      return deny(`No Access Allowed to that object (${DELEGATE_TYPE[resource]} : ${objectId})`)
    }

    if (await this.isInGroupTree(credentials.group.id, objGroupId)) {
      if (action === 'read') return allow()
      const permissionAction = ACTION_PERMISSION[action] ?? action
      if (perm[resource]?.[permissionAction] === true) return allow()
      return deny(`You have no '${action}' permission for ${resource} objects`)
    }

    const delegation = await this.getDelegateAccess(
      credentials.group.id, objectId, resource,
    )
    if (delegation) {
      if (action === 'read') return allow({ delegation })
      const displayAction = ACTION_PERMISSION[action] ?? action
      if (action === 'editDelegation') {
        return deny(`You have no '${displayAction}' permission for the delegated object`)
      }
      // v2 sets pseudo => 'none' on every delegate action: access inherited
      // from a parent object never carries the right to delegate
      if (delegation.pseudo && action === 'delegate') {
        return deny(`You have no '${action}' permission for the delegated object`)
      }
      if (resource === 'zonerecord' && delegation.pseudo && action === 'delete') {
        if (delegation.zone_perm_delete_records === 1) return allow()
        return deny(`You have no '${action}' permission for the delegated object`)
      }
      if (action === 'delete') {
        return deny(`You have no '${action}' permission for the delegated object`)
      }
      const permField = action === 'deleteDelegation'
        ? 'perm_delete'
        : `perm_${action}`
      if (delegation[permField] === 1) return allow()
      return deny(`You have no '${displayAction}' permission for the delegated object`)
    }

    return deny(
      `No Access Allowed to that object (${DELEGATE_TYPE[resource]} : ${objectId})`,
    )
  }

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
    const rows = await Mysql.execute(
      'SELECT 1 FROM nt_group WHERE nt_group_id = ? AND deleted = 0',
      [groupId],
    )
    return rows.length > 0
  }

  async isActiveObject(resource, objectId) {
    const table = delegateTable(resource)
    const idColumn = delegateIdColumn(resource)?.slice(2)
    if (!table || !idColumn) return false
    const rows = await Mysql.execute(
      `SELECT 1 FROM ${table} WHERE ${idColumn} = ? AND deleted = 0`,
      [objectId],
    )
    return rows.length > 0
  }

  async getDelegateAccess(groupId, objectId, resource) {
    const type = DELEGATE_TYPE[resource]
    if (!type) return null

    const direct = await this.getDirectDelegateAccess(groupId, objectId, resource)
    if (direct) return direct

    if (resource === 'zonerecord') {
      return this.getZoneRecordPseudoDelegation(groupId, objectId)
    }
    if (resource === 'zone') {
      return this.getZonePseudoDelegation(groupId, objectId)
    }
    return null
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
    const gids = (Array.isArray(groupIds) ? groupIds : [groupIds])
      .map(Number)
      .filter(Number.isInteger)
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

  async getZoneRecordReadScope(groupId, zoneId) {
    const objectGroupId = await this.getObjectGroupId('zone', zoneId)
    if (objectGroupId === null) return []
    if (await this.isInGroupTree(groupId, objectGroupId)) return null
    if (await this.getDirectDelegateAccess(groupId, zoneId, 'zone')) return null

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

  // v2 grants read on a zone to any group holding a delegation on one of its
  // records. Every permission is 0, so only the read fast-paths above accept it.
  async getZonePseudoDelegation(groupId, zoneId) {
    const rows = await Mysql.execute(
      `SELECT 1 FROM nt_delegate d
       JOIN nt_zone_record r ON r.nt_zone_record_id = d.nt_object_id
       JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
       WHERE d.nt_group_id = ?
         AND z.nt_zone_id = ?
         AND d.nt_object_type = 'ZONERECORD'
         AND d.deleted = 0 AND r.deleted = 0 AND z.deleted = 0
       LIMIT 1`,
      [groupId, zoneId],
    )
    if (rows.length === 0) return null
    return {
      pseudo: 1,
      perm_write: 0,
      perm_delete: 0,
      perm_delegate: 0,
      zone_perm_add_records: 0,
      zone_perm_delete_records: 0,
    }
  }

  async getZoneRecordPseudoDelegation(groupId, zoneRecordId) {
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

  capPermissions(userPerm, targetPerms, existingPerm) {
    if (!targetPerms || !userPerm) return targetPerms

    const capped = { ...targetPerms }
    for (const field of PERM_FIELDS) {
      if (capped[field] === undefined) continue
      const [resource] = field.split('_', 2)
      const remaining = field.slice(resource.length + 1)
      if (userPerm[resource]?.[remaining] !== true) {
        delete capped[field]
      }
    }

    for (const resource of ['group', 'nameserver', 'user', 'zone', 'zonerecord']) {
      if (!capped[resource]) continue
      capped[resource] = { ...capped[resource] }
      for (const action of ['create', 'write', 'delete', 'delegate']) {
        if (capped[resource][action] === undefined) continue
        if (userPerm[resource]?.[action] !== true) delete capped[resource][action]
      }
    }

    if (capped.self_write !== undefined && userPerm.user?.write !== true) {
      delete capped.self_write
    }

    const usable = userPerm.nameserver?.usable ?? []
    const existingUsable = existingPerm?.nameserver?.usable ?? []
    if (Array.isArray(capped.usable_ns)) {
      capped.usable_ns = capUsableNameservers(capped.usable_ns, usable, existingUsable)
    }
    if (Array.isArray(capped.nameserver?.usable)) {
      capped.nameserver.usable = capUsableNameservers(
        capped.nameserver.usable, usable, existingUsable,
      )
    }
    return capped
  }

  canTransitionPermissions(userPerm, before, after) {
    for (const field of PERM_FIELDS) {
      const [resource] = field.split('_', 1)
      const action = field.slice(resource.length + 1)
      if (userPerm[resource]?.[action] === true) continue
      if (Boolean(before?.[resource]?.[action]) !== Boolean(after?.[resource]?.[action])) {
        return false
      }
    }

    if (
      userPerm.user?.write !== true
      && Boolean(before?.self_write) !== Boolean(after?.self_write)
    ) {
      return false
    }

    const allowed = new Set((userPerm.nameserver?.usable ?? []).map(String))
    const oldUsable = new Set((before?.nameserver?.usable ?? []).map(String))
    const newUsable = new Set((after?.nameserver?.usable ?? []).map(String))
    for (const id of new Set([...oldUsable, ...newUsable])) {
      if (oldUsable.has(id) !== newUsable.has(id) && !allowed.has(id)) return false
    }
    return true
  }

  preserveUnmanagedPermissions(userPerm, targetPerms, currentPerm) {
    const preserved = { ...targetPerms }
    for (const field of PERM_FIELDS) {
      const [resource] = field.split('_', 1)
      const action = field.slice(resource.length + 1)
      if (userPerm[resource]?.[action] !== true) {
        preserved[field] = Boolean(currentPerm?.[resource]?.[action])
      }
    }
    if (userPerm.user?.write !== true) {
      preserved.self_write = Boolean(currentPerm?.self_write)
    }
    return preserved
  }

  async getCurrentCredentials(credentials) {
    // Match the JWT's maximum token age when checking server-side revocation.
    const oldest = Math.floor(Date.now() / 1000) - SESSION_MAX_AGE_SEC
    const rows = await Mysql.execute(
      `SELECT u.nt_group_id AS gid
       FROM nt_user u
       JOIN nt_group g ON g.nt_group_id = u.nt_group_id
       JOIN nt_user_session s ON s.nt_user_id = u.nt_user_id
       WHERE u.nt_user_id = ? AND s.nt_user_session_id = ?
         AND u.deleted = 0 AND g.deleted = 0
         AND s.last_access >= ?`,
      [credentials.user.id, credentials.session.id, oldest],
    )
    if (rows.length === 0) return null
    return {
      ...credentials,
      group: { ...credentials.group, id: rows[0].gid },
    }
  }

  async checkPermissionRecord(credentials, action, permissionId) {
    const rows = await Mysql.execute(
      `SELECT NULLIF(p.nt_user_id, 0) AS uid,
              NULLIF(p.nt_group_id, 0) AS gid,
              COALESCE(NULLIF(p.nt_group_id, 0), u.nt_group_id) AS target_gid
       FROM nt_perm p
       LEFT JOIN nt_user u ON u.nt_user_id = p.nt_user_id
       WHERE p.nt_perm_id = ?`,
      [permissionId],
    )
    if (rows.length === 0 || rows[0].target_gid === null) {
      return deny(`No Access Allowed to that permission (${permissionId})`)
    }

    if (action === 'read') {
      return await this.isInGroupTree(credentials.group.id, rows[0].target_gid)
        ? allow()
        : deny(`No Access Allowed to that permission (${permissionId})`)
    }

    if (rows[0].uid !== null) {
      if (rows[0].uid === credentials.user.id) {
        return deny(`Not allowed to modify your own permissions`)
      }
      if (!await this.isActiveObject('user', rows[0].uid)) {
        return deny(`Cannot modify permissions for a deleted user`)
      }
      return this.checkPermission(credentials, 'user', 'write', rows[0].uid)
    }
    if (!await this.isActiveGroup(rows[0].gid)) {
      return deny(`Cannot modify permissions for a deleted group`)
    }
    return this.checkPermission(credentials, 'group', 'write', rows[0].gid)
  }

  async checkPermissionTarget(credentials, payload) {
    const uid = payload.user?.id
    if (uid !== undefined && uid !== null) {
      if (uid === credentials.user.id) {
        return deny(`Not allowed to modify your own permissions`)
      }
      if (!await this.isActiveObject('user', uid)) {
        return deny(`Cannot create permissions for a deleted user`)
      }
      // the row is stored with both ids; an unrelated gid would put it outside
      // the tree that owns the user, so only the user's own group is accepted
      const payloadGid = payload.group?.id
      if (payloadGid !== undefined && payloadGid !== null) {
        const userGid = await this.getObjectGroupId('user', uid)
        if (Number(payloadGid) !== userGid) {
          return deny(`That permission target does not belong to that group`)
        }
      }
      return this.checkPermission(credentials, 'user', 'write', uid)
    }

    const gid = payload.group?.id
    if (gid === undefined || gid === null) return deny(`No permission target found`)
    if (!await this.isActiveGroup(gid)) {
      return deny(`Cannot create permissions for a deleted group`)
    }
    return this.checkPermission(credentials, 'group', 'write', gid)
  }
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

function allow(extra = {}) {
  return { allowed: true, ...extra }
}

function deny(msg) {
  return { allowed: false, code: 404, msg }
}

function capUsableNameservers(requested, allowed, existing) {
  const allowedIds = new Set(allowed.map(String))
  const result = requested.map(String).filter((id) => allowedIds.has(id))
  for (const id of existing.map(String)) {
    if (!allowedIds.has(id) && !result.includes(id)) result.push(id)
  }
  return result
}

export default new Authz()
