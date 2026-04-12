import Permission from '../../lib/permission/index.js'

// Route tests exercise write ops as fixture users, who inherit group-level
// permissions; grant everything so the authz plugin lets them through.
export async function grantGroupPermissions(gid) {
  const perms = {
    group_write: 1,
    group_create: 1,
    group_delete: 1,
    zone_write: 1,
    zone_create: 1,
    zone_delegate: 1,
    zone_delete: 1,
    zonerecord_write: 1,
    zonerecord_create: 1,
    zonerecord_delegate: 1,
    zonerecord_delete: 1,
    user_write: 1,
    user_create: 1,
    user_delete: 1,
    nameserver_write: 1,
    nameserver_create: 1,
    nameserver_delete: 1,
  }

  const existing = await Permission.get({ gid })
  if (existing) {
    await Permission.put({ id: existing.id, ...perms })
    return
  }

  await Permission.create({
    gid,
    inherit: true,
    name: `route test permissions`,
    ...perms,
  })
}
