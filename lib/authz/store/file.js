import Delegation from '../../delegation/index.js'
import FileStore from '../../store/file.js'

import AuthzBase from './base.js'

// object lookups by authz resource: which file holds the rows and which key
// carries the group
const RESOURCES = {
  zone: { file: 'zone' },
  zonerecord: { file: 'zone_record' },
  user: { file: 'user' },
  nameserver: { file: 'nameserver' },
  group: { file: 'group', selfOwned: true },
}

class AuthzRepoFile extends AuthzBase {
  async _rows(file) {
    return new FileStore(file).load(file)
  }

  async _object(resource, objectId) {
    const meta = RESOURCES[resource]
    if (!meta) return null
    const rows = await this._rows(meta.file)
    return rows.find((r) => r.id === objectId) ?? null
  }

  async getObjectGroupId(resource, objectId) {
    if (resource === 'zonerecord') {
      const record = await this._object('zonerecord', objectId)
      if (!record) return null
      return this.getObjectGroupId('zone', record.zid)
    }
    const row = await this._object(resource, objectId)
    if (!row) return null
    if (resource === 'group') {
      // the root group has no parent; v2 routes its objects to group 1
      return row.parent_gid ?? row.gid ?? 1
    }
    return row.gid ?? null
  }

  async isInGroupTree(userGroupId, targetGroupId) {
    if (userGroupId === targetGroupId) return true
    const groups = await this._rows('group')
    const queue = [userGroupId]
    const seen = new Set(queue)
    while (queue.length > 0) {
      const current = queue.shift()
      for (const g of groups) {
        if (g.parent_gid === current && !seen.has(g.id)) {
          if (g.id === targetGroupId) return true
          seen.add(g.id)
          queue.push(g.id)
        }
      }
    }
    return false
  }

  async isActiveGroup(groupId) {
    const group = await this._object('group', groupId)
    return group != null && group.deleted !== true
  }

  async isActiveObject(resource, objectId) {
    const row = await this._object(resource, objectId)
    return row != null && row.deleted !== true
  }

  async getDirectDelegateAccess(groupId, objectId, resource) {
    const type = { zone: 'ZONE', zonerecord: 'ZONERECORD', nameserver: 'NAMESERVER', group: 'GROUP' }[
      resource
    ]
    if (!type) return null

    const delegations = await Delegation.getDelegates(objectId, type, groupId)
    if (delegations.length === 0) return null
    if (!(await this.isActiveObject(resource, objectId))) return null
    const row = delegations[0]
    // mysql returns raw nt_delegate columns here; shape them to match
    return {
      nt_group_id: row.nt_group_id,
      nt_object_id: row.nt_object_id,
      nt_object_type: row.nt_object_type,
      perm_write: row.delegate_write,
      perm_delete: row.delegate_delete,
      perm_delegate: row.delegate_delegate,
      zone_perm_add_records: row.delegate_add_records,
      zone_perm_delete_records: row.delegate_delete_records,
    }
  }

  async getDelegatedZoneIds(groupIds) {
    const gids = (Array.isArray(groupIds) ? groupIds : [groupIds]).map(Number).filter(Number.isInteger)

    const zones = await this._rows('zone')
    const records = await this._rows('zone_record')
    const zoneById = new Map(zones.map((z) => [z.id, z]))

    const ids = []
    for (const gid of gids) {
      for (const d of await Delegation.getDelegated(gid, 'ZONE')) {
        const zone = zoneById.get(d.nt_object_id)
        if (zone?.deleted !== true) ids.push(d.nt_object_id)
      }
      for (const d of await Delegation.getDelegated(gid, 'ZONERECORD')) {
        const record = records.find((r) => r.id === d.nt_object_id)
        const zone = zoneById.get(record?.zid)
        if (record?.deleted !== true && zone?.deleted !== true) ids.push(record.zid)
      }
    }
    return [...new Set(ids)]
  }

  async delegatedRecordIdsInZone(groupId, zoneId) {
    const delegations = await Delegation.getDelegated(groupId, 'ZONERECORD')
    const records = await this._rows('zone_record')
    const zones = await this._rows('zone')

    const zone = zones.find((z) => z.id === zoneId)
    if (!zone || zone.deleted === true) return []

    return delegations
      .map((d) => records.find((r) => r.id === d.nt_object_id))
      .filter((r) => r && r.deleted !== true && r.zid === zoneId)
      .map((r) => r.id)
  }

  async zoneDelegationForRecord(groupId, zoneRecordId) {
    const records = await this._rows('zone_record')
    const record = records.find((r) => r.id === zoneRecordId && r.deleted !== true)
    if (!record) return null

    const direct = await this.getDirectDelegateAccess(groupId, record.zid, 'zone')
    return direct ? { ...direct, pseudo: 1 } : null
  }

  async liveSessionGroup(userId, sessionId, oldestSec) {
    const users = await this._rows('user')
    const groups = await this._rows('group')
    const sessions = await this._rows('session')

    const user = users.find((u) => u.id === userId && u.deleted !== true)
    if (!user) return null
    const group = groups.find((g) => g.id === user.gid && g.deleted !== true)
    if (!group) return null

    const session = sessions.find(
      (s) => s.uid === userId && s.id === sessionId && (s.last_access ?? Infinity) >= oldestSec,
    )
    return session ? user.gid : null
  }

  async permissionRecord(permissionId) {
    // permissions ride on user and group rows in the file store
    const users = await this._rows('user')
    const groups = await this._rows('group')

    for (const u of users) {
      const p = u.permissions
      if (p && (p.permissionId === permissionId || p.id === permissionId)) {
        return { uid: u.id, gid: p.group?.id ?? u.gid, target_gid: u.gid }
      }
    }
    for (const g of groups) {
      const p = g.permissions
      if (p && (p.permissionId === permissionId || p.id === permissionId)) {
        return { uid: null, gid: g.id, target_gid: g.id }
      }
    }
    return null
  }
}

export default AuthzRepoFile
