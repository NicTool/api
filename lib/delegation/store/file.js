import FileStore from '../../store/file.js'

import DelegationBase, { PERM_FIELDS } from './base.js'

const TYPES = {
  ZONE: { file: 'zone', idCol: 'nt_zone_id' },
  ZONERECORD: { file: 'zone_record', idCol: 'nt_zone_record_id' },
  NAMESERVER: { file: 'nameserver', idCol: 'nt_nameserver_id' },
  GROUP: { file: 'group', idCol: 'nt_group_id' },
}

class DelegationRepoFile extends DelegationBase {
  constructor() {
    super()
    this.file = new FileStore('delegation')
    this.logFile = new FileStore('delegate_log')
  }

  async _load() {
    return this.file.load('delegation')
  }

  async _save(rows) {
    return this.file.save('delegation', rows)
  }

  // delegations join against four entity files; each is a separate document,
  // so lookups that mysql does with a JOIN happen row-at-a-time here
  async _object(type, oid) {
    const meta = TYPES[type]
    if (!meta) return null
    const rows = await new FileStore(meta.file).load(meta.file)
    return rows.find((r) => r.id === oid && r.deleted !== true) ?? null
  }

  async _activeGroupNames() {
    const groups = await new FileStore('group').load('group')
    return new Map(groups.filter((g) => g.deleted !== true).map((g) => [g.id, g.name]))
  }

  async _present(rows) {
    const names = await this._activeGroupNames()
    return rows.map((row) => ({
      nt_group_id: row.gid,
      nt_object_id: row.oid,
      nt_object_type: row.type,
      group_name: names.get(row.gid) ?? '',
      delegated_by_id: row.delegated_by_id ?? 0,
      delegated_by_name: row.delegated_by_name ?? '',
      delegate_write: row.perm_write ? 1 : 0,
      delegate_delete: row.perm_delete ? 1 : 0,
      delegate_delegate: row.perm_delegate ? 1 : 0,
      delegate_add_records: row.zone_perm_add_records ? 1 : 0,
      delegate_delete_records: row.zone_perm_delete_records ? 1 : 0,
    }))
  }

  async create(args) {
    const { gid, oid, type } = args
    if (!TYPES[type]) return {}

    const rows = await this._load()
    if (rows.some((r) => r.gid === gid && r.oid === oid && r.type === type)) {
      return { duplicate: true }
    }

    const row = {
      gid,
      oid,
      type,
      delegated_by_id: args.delegated_by_id ?? 0,
      delegated_by_name: args.delegated_by_name ?? '',
    }
    for (const f of PERM_FIELDS) row[f] = args[f] === true

    rows.push(row)
    await this._save(rows)

    await this.writeLog({ ...row, ...permsToInt(row) }, 'delegated')

    return { created: true }
  }

  async getDelegated(gid, type) {
    if (!TYPES[type]) return []
    const rows = (await this._load()).filter(
      (r) => r.gid === gid && r.type === type,
    )
    const active = []
    for (const row of rows) {
      if (await this._object(type, row.oid)) active.push(row)
    }
    const presented = await this._present(active)
    const meta = TYPES[type]
    for (const p of presented) p[meta.idCol] = p.nt_object_id
    return presented
  }

  async getDelegates(oid, type, gid) {
    if (!TYPES[type]) return []
    let rows = (await this._load()).filter(
      (r) => r.oid === oid && r.type === type,
    )
    if (gid !== undefined) rows = rows.filter((r) => r.gid === gid)
    return this._present(rows)
  }

  async put(args) {
    const { gid, oid, type } = args
    const rows = await this._load()
    const row = rows.find((r) => r.gid === gid && r.oid === oid && r.type === type)
    if (!row) return null

    const updates = {}
    for (const f of PERM_FIELDS) {
      if (args[f] !== undefined) updates[f] = args[f] === true
    }
    if (Object.keys(updates).length === 0) return true

    Object.assign(row, updates)
    await this._save(rows)

    await this.writeLog(
      { ...row, delegated_by_id: args.delegated_by_id, delegated_by_name: args.delegated_by_name },
      'modified',
    )

    return true
  }

  async delete(args) {
    const { gid, oid, type } = args
    let rows = await this._load()
    const row = rows.find((r) => r.gid === gid && r.oid === oid && r.type === type)
    if (!row) return null

    rows = rows.filter((r) => r !== row)
    await this._save(rows)

    await this.writeLog(row, 'deleted')

    return true
  }

  async writeLog(data, action) {
    const logs = await this.logFile.load('delegate_log')
    logs.push({
      nt_user_id: data.delegated_by_id ?? 0,
      nt_user_name: data.delegated_by_name ?? '',
      action,
      nt_object_type: data.nt_object_type ?? data.type,
      nt_object_id: data.nt_object_id ?? data.oid,
      nt_group_id: data.nt_group_id ?? data.gid,
      timestamp: Math.floor(Date.now() / 1000),
      perm_write: (data.perm_write ?? true) ? 1 : 0,
      perm_delete: (data.perm_delete ?? true) ? 1 : 0,
      perm_delegate: (data.perm_delegate ?? true) ? 1 : 0,
      zone_perm_add_records: (data.zone_perm_add_records ?? true) ? 1 : 0,
      zone_perm_delete_records: (data.zone_perm_delete_records ?? true) ? 1 : 0,
    })
    await this.logFile.save('delegate_log', logs)
  }
}

function permsToInt(row) {
  const out = {}
  for (const f of PERM_FIELDS) out[f] = row[f] ? 1 : 0
  return out
}

export default DelegationRepoFile
