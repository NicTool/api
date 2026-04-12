import Mysql from './mysql.js'
import Permission from './permission.js'

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

class Authz {
  async checkPermission(credentials, resource, action, objectId, opts) {
    const perm = await Permission.getEffective(credentials.user.id)
    if (!perm) return deny(`No permissions found`)

    if (action === 'create') {
      if (perm[resource]?.create !== true) {
        return deny(`Not allowed to create new ${resource}`)
      }
      const targetGid = opts?.targetGroupId
      if (targetGid) {
        const inTree = await this.isInGroupTree(
          credentials.group.id, targetGid,
        )
        if (!inTree) {
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
    }

    if (resource === 'nameserver' && action === 'read') {
      const usable = perm.nameserver?.usable ?? []
      if (usable.includes(String(objectId))) return allow()
    }

    const objGroupId = await this.getObjectGroupId(resource, objectId)
    if (objGroupId === null) {
      return deny(`No Access Allowed to that object (${DELEGATE_TYPE[resource]} : ${objectId})`)
    }

    if (await this.isInGroupTree(credentials.group.id, objGroupId)) {
      if (action === 'read') return allow()
      if (perm[resource]?.[action] === true) return allow()
      return deny(`You have no '${action}' permission for ${resource} objects`)
    }

    const delegation = await this.getDelegateAccess(
      credentials.group.id, objectId, resource,
    )
    if (delegation) {
      if (action === 'read') return allow()
      const permField = `perm_${action === 'delegate' ? 'delegate' : action}`
      if (delegation[permField] === 1) return allow()
      return deny(`You have no '${action}' permission for the delegated object`)
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

  async getDelegateAccess(groupId, objectId, resource) {
    const type = DELEGATE_TYPE[resource]
    if (!type) return null

    const rows = await Mysql.execute(
      `SELECT * FROM nt_delegate
       WHERE nt_group_id = ? AND nt_object_id = ? AND nt_object_type = ? AND deleted = 0`,
      [groupId, objectId, type],
    )
    if (rows.length > 0) return rows[0]

    if (resource === 'zonerecord') {
      return this.getZoneRecordPseudoDelegation(groupId, objectId)
    }
    return null
  }

  async getZoneRecordPseudoDelegation(groupId, zoneRecordId) {
    const rows = await Mysql.execute(
      `SELECT d.*, 1 AS pseudo FROM nt_delegate d
       JOIN nt_zone_record r ON r.nt_zone_id = d.nt_object_id
       WHERE d.nt_group_id = ?
         AND r.nt_zone_record_id = ?
         AND d.nt_object_type = 'ZONE'
         AND d.deleted = 0`,
      [groupId, zoneRecordId],
    )
    return rows.length > 0 ? rows[0] : null
  }

  capPermissions(userPerm, targetPerms) {
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
    return capped
  }
}

function allow() {
  return { allowed: true }
}

function deny(msg) {
  return { allowed: false, code: 404, msg }
}

export default new Authz()
