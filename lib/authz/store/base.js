/**
 * Authz domain class – pure policy and cross-cutting logic.
 *
 * Has zero knowledge of how users, groups, delegations, or sessions are
 * persisted. All authz repository classes must extend this class and implement
 * the repo contract.
 *
 * Repo contract:
 *   objectGroupId(resource, objectId)         → gid | null
 *   isInGroupTree(userGid, targetGid)          → boolean
 *   isActiveGroup(gid)                         → boolean
 *   isActiveObject(resource, objectId)         → boolean
 *   getDirectDelegateAccess(gid, oid, resource) → row | null
 *   getDelegatedZoneIds(groupIds)              → number[]
 *   delegatedRecordIdsInZone(gid, zid)         → number[]  ([] when no access)
 *   zonePseudoDelegation(gid, zid)             → row | null
 *   zoneDelegationForRecord(gid, zrid)         → row | null
 *   liveSessionGroup(userId, sessionId, oldestSec) → gid | null
 *   permissionRecord(permissionId)             → { uid, gid, target_gid } | null
 */
import Permission from '../../permission/index.js'

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

class AuthzBase {
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

  async getDelegateAccess(groupId, objectId, resource) {
    const type = DELEGATE_TYPE[resource]
    if (!type) return null

    const direct = await this.getDirectDelegateAccess(groupId, objectId, resource)
    if (direct) return direct

    if (resource === 'zonerecord') {
      return this.zoneDelegationForRecord(groupId, objectId)
    }
    if (resource === 'zone') {
      return this.zonePseudoDelegation(groupId, objectId)
    }
    return null
  }

  async getZoneRecordReadScope(groupId, zoneId) {
    const objectGroupId = await this.getObjectGroupId('zone', zoneId)
    if (objectGroupId === null) return []
    if (await this.isInGroupTree(groupId, objectGroupId)) return null
    if (await this.getDirectDelegateAccess(groupId, zoneId, 'zone')) return null
    return this.delegatedRecordIdsInZone(groupId, zoneId)
  }

  // v2 grants read on a zone to any group holding a delegation on one of its
  // records. Every permission is 0, so only the read fast-paths above accept it.
  async zonePseudoDelegation(groupId, zoneId) {
    const rows = await this.delegatedRecordIdsInZone(groupId, zoneId)
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
    const gid = await this.liveSessionGroup(
      credentials.user.id, credentials.session.id, oldest,
    )
    if (gid === null) return null
    return {
      ...credentials,
      group: { ...credentials.group, id: gid },
    }
  }

  async checkPermissionRecord(credentials, action, permissionId) {
    const record = await this.permissionRecord(permissionId)
    if (!record || record.target_gid === null) {
      return deny(`No Access Allowed to that permission (${permissionId})`)
    }

    if (action === 'read') {
      return await this.isInGroupTree(credentials.group.id, record.target_gid)
        ? allow()
        : deny(`No Access Allowed to that permission (${permissionId})`)
    }

    if (record.uid !== null) {
      if (record.uid === credentials.user.id) {
        return deny(`Not allowed to modify your own permissions`)
      }
      if (!await this.isActiveObject('user', record.uid)) {
        return deny(`Cannot modify permissions for a deleted user`)
      }
      return this.checkPermission(credentials, 'user', 'write', record.uid)
    }
    if (!await this.isActiveGroup(record.gid)) {
      return deny(`Cannot modify permissions for a deleted group`)
    }
    return this.checkPermission(credentials, 'group', 'write', record.gid)
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

export default AuthzBase
