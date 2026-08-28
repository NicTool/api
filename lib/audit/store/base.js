/**
 * Audit domain class – pure contract and cross-cutting logic.
 *
 * Has zero knowledge of how audit entries are persisted. All audit repository
 * classes must extend this class and implement the repo contract.
 *
 * Repo contract:
 *   insertZoneLog(detail)         → logId
 *   insertZoneRecordLog(detail)   → logId
 *   insertGlobalLog(entry)        → void
 *   listGlobal(args)              → { rows, total, filtered, limit, offset }
 *   listZones(args)               → same shape
 *   listZoneRecords(args)         → same shape
 */
const actionDescription = {
  added: 'initial creation',
  deleted: 'deleted',
  modified: 'modified',
  moved: 'moved',
  recovered: 'recovered',
}

class AuditBase {
  async logZone(actor, action, zone, previous = {}) {
    const timestamp = Math.floor(Date.now() / 1000)
    const detail = compact({
      gid: zone.gid,
      zid: zone.id,
      uid: actor.id,
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
    const logId = await this.insertZoneLog(detail)
    await this.insertGlobalLog({
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
      zid: record.zid,
      zrid: record.id,
      uid: actor.id,
      action,
      timestamp,
      owner: record.owner,
      ttl: record.ttl,
      description: record.description,
      type: record.type,
      address: record.address,
      weight: record.weight,
      priority: record.priority,
      other: record.other,
      location: record.location,
    })
    const logId = await this.insertZoneRecordLog(detail)
    await this.insertGlobalLog({
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

  async insertZoneLog(_detail) {
    throw new Error('insertZoneLog() not implemented by this store')
  }

  async insertZoneRecordLog(_detail) {
    throw new Error('insertZoneRecordLog() not implemented by this store')
  }

  async insertGlobalLog(_entry) {
    throw new Error('insertGlobalLog() not implemented by this store')
  }

  async listGlobal(_args) {
    throw new Error('listGlobal() not implemented by this store')
  }

  async listZones(_args) {
    throw new Error('listZones() not implemented by this store')
  }

  // args.ids, when present, limits the rows to those zone record ids
  async listZoneRecords(_args) {
    throw new Error('listZoneRecords() not implemented by this store')
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

export default AuditBase
