import Authz from './authz.js'
import Mysql from './mysql.js'

const TYPE_TO_RESOURCE = {
  ZONE: 'zone',
  ZONERECORD: 'zonerecord',
  NAMESERVER: 'nameserver',
  GROUP: 'group',
}

const authzPlugin = {
  name: 'nt-authz',
  register(server) {
    server.ext('onPreHandler', async (request, h) => {
      const permCfg = request.route.settings.app?.permission
      if (!permCfg) return h.continue

      if (!request.auth.isAuthenticated) return h.continue

      let { resource, action } = permCfg
      const { idFrom } = permCfg
      const credentials = request.auth.credentials

      let objectId
      if (idFrom) {
        objectId = resolveId(request, idFrom)
        if (objectId !== undefined) objectId = Number(objectId)
      }

      // List requests (no objectId) don't need per-object authz
      if (action === 'read' && objectId === undefined) {
        return h.continue
      }

      // Delegation: resolve resource from the type field
      if (action === 'delegate') {
        const type = request.payload?.type ?? request.query?.type
        if (type && TYPE_TO_RESOURCE[type]) {
          resource = TYPE_TO_RESOURCE[type]
        }
      }

      let opts
      if (action === 'create') {
        const targetGid = await resolveTargetGroup(
          request, resource,
        )
        if (targetGid) opts = { targetGroupId: targetGid }
      }

      const result = await Authz.checkPermission(
        credentials, resource, action, objectId, opts,
      )

      if (result.allowed) return h.continue

      return h.response({
        error_code: result.code,
        error_msg: result.msg,
      }).code(403).takeover()
    })
  },
}

function resolveId(request, idFrom) {
  const [source, key] = idFrom.split('.')
  if (source === 'params') return request.params[key]
  if (source === 'payload') return request.payload?.[key]
  if (source === 'query') return request.query?.[key]
}

async function resolveTargetGroup(request, resource) {
  const gid = request.payload?.gid
    ?? request.payload?.nt_group_id
    ?? request.payload?.parent_gid
  if (gid) return Number(gid)

  if (resource === 'zonerecord') {
    const zid = request.payload?.zid ?? request.payload?.nt_zone_id
    if (zid) {
      const rows = await Mysql.execute(
        'SELECT nt_group_id FROM nt_zone WHERE nt_zone_id = ?',
        [zid],
      )
      if (rows.length > 0) return rows[0].nt_group_id
    }
  }

  return null
}

export default authzPlugin
