import Authz from './authz/index.js'
import Zone from './zone/index.js'
import ZoneRecord from './zone_record/index.js'

const TYPE_TO_RESOURCE = {
  ZONE: 'zone',
  ZONERECORD: 'zonerecord',
  NAMESERVER: 'nameserver',
  GROUP: 'group',
}

const DELEGABLE_RESOURCE = {
  ZONE: 'zone',
  ZONERECORD: 'zonerecord',
}

const authzPlugin = {
  name: 'nt-authz',
  register(server) {
    server.ext('onPreHandler', async (request, h) => {
      const isLogin = request.method === 'post' && request.route.path === '/session'
      if (request.auth.isAuthenticated && !isLogin) {
        const credentials = await Authz.getCurrentCredentials(request.auth.credentials)
        if (!credentials) {
          return h.response({
            error_code: 401,
            error_msg: 'Session is no longer valid',
          }).code(401).takeover()
        }
        request.auth.credentials = credentials
      }

      const permCfg = request.route.settings.app?.permission
      if (!permCfg) return h.continue

      if (!request.auth.isAuthenticated) return h.continue

      let { resource, action } = permCfg
      const credentials = request.auth.credentials

      if (resource === 'permission') {
        const result = action === 'create'
          ? await Authz.checkPermissionTarget(credentials, request.payload)
          : await Authz.checkPermissionRecord(
            credentials, action, Number(resolveId(request, permCfg.idFrom)),
          )
        return respond(result, h)
      }

      if (action === 'readDelegation') {
        const type = request.query?.type
        const delegatedResource = TYPE_TO_RESOURCE[type]
        if (!delegatedResource) {
          return respond({ allowed: false, code: 404, msg: `Unknown delegation type` }, h)
        }
        if (request.query.oid !== undefined) {
          const object = await Authz.checkPermission(
            credentials, delegatedResource, 'read', Number(request.query.oid),
          )
          if (!object.allowed) return respond(object, h)
        }
        if (request.query.gid !== undefined) {
          const group = await Authz.checkPermission(
            credentials, 'group', 'read', Number(request.query.gid),
          )
          if (!group.allowed) return respond(group, h)
        }
        if (request.query.oid === undefined && request.query.gid === undefined) {
          return respond({ allowed: false, code: 404, msg: `A delegation scope is required` }, h)
        }
        return h.continue
      }

      let objectId
      if (permCfg.idFrom) {
        objectId = resolveId(request, permCfg.idFrom)
        if (objectId !== undefined) objectId = Number(objectId)
      }

      if (permCfg.targetGroupFrom) {
        const targetGid = resolveId(request, permCfg.targetGroupFrom)
        if (targetGid !== undefined) {
          if (
            resource === 'user'
            && action === 'write'
            && objectId === credentials.user.id
            && Number(targetGid) !== credentials.group.id
          ) {
            return respond({
              allowed: false,
              code: 403,
              msg: `Cannot move yourself to another group`,
            }, h)
          }
          if (
            resource === 'group'
            && action === 'write'
            && (
              Number(targetGid) === objectId
              || await Authz.isInGroupTree(objectId, Number(targetGid))
            )
          ) {
            return respond({ allowed: false, code: 404, msg: `A group cannot contain itself` }, h)
          }
          if (!await Authz.isActiveGroup(Number(targetGid))) {
            return respond({ allowed: false, code: 404, msg: `Target group is deleted` }, h)
          }
          const target = await Authz.checkPermission(
            credentials, 'group', 'read', Number(targetGid),
          )
          if (!target.allowed) return respond(target, h)
        }
      }

      const sourceZid = await movedFromZone(request, resource, action, objectId)
      if (sourceZid !== null) {
        // moving out of a zone needs delete rights where the record lives,
        // not just create rights where it's going
        const source = await Authz.checkPermission(
          credentials, resource, 'delete', objectId,
        )
        if (!source.allowed) return respond(source, h)

        const target = await resolveTargetGroup(request, permCfg.targetCreateResource)
        const targetResult = await Authz.checkPermission(
          credentials,
          permCfg.targetCreateResource,
          'create',
          undefined,
          { targetGroupId: target?.gid, targetZoneId: target?.zid },
        )
        if (!targetResult.allowed) return respond(targetResult, h)
      }

      if (action === 'read' && objectId === undefined) {
        const list = permCfg.list
        if (!list) return h.continue
        resource = list.resource
        objectId = resolveId(request, list.idFrom)
        if (objectId === undefined && list.defaultToGroup) {
          objectId = credentials.group.id
        }
        if (objectId === undefined) {
          return respond({
            allowed: false,
            code: 404,
            msg: `A scoped collection id is required`,
          }, h)
        }
        objectId = Number(objectId)
      }

      if (action.endsWith('Delegation') || action === 'delegate') {
        const type = request.payload?.type ?? request.query?.type
        // only zones and zone records are delegable; nothing caps the granted
        // permissions for the other nt_delegate types, so refuse them outright
        if (!DELEGABLE_RESOURCE[type]) {
          return respond({
            allowed: false,
            code: 404,
            msg: `${type} objects cannot be delegated`,
          }, h)
        }
        resource = DELEGABLE_RESOURCE[type]

        const targetGid = request.payload?.gid ?? request.query?.gid
        if (targetGid !== undefined) {
          if (!await Authz.isActiveGroup(Number(targetGid))) {
            return respond({ allowed: false, code: 404, msg: `Delegation target group is deleted` }, h)
          }
          const target = await Authz.checkPermission(
            credentials, 'group', 'read', Number(targetGid),
          )
          if (!target.allowed) return respond(target, h)
          if (request.method === 'post' && Number(targetGid) === credentials.group.id) {
            return respond({
              allowed: false,
              code: 404,
              msg: `Cannot delegate to your own group`,
            }, h)
          }
        }
      }

      let opts
      if (action === 'create') {
        if (request.payload?.id !== undefined) {
          const existingGid = await Authz.getObjectGroupId(resource, request.payload.id)
          if (existingGid !== null) {
            return respond({ allowed: false, code: 404, msg: `That ${resource} id already exists` }, h)
          }
        }
        const target = await resolveTargetGroup(
          request, resource,
        )
        opts = {
          targetGroupId: target?.gid,
          targetZoneId: target?.zid,
        }
      }

      const result = await Authz.checkPermission(
        credentials, resource, action, objectId, opts,
      )
      if (!result.allowed) return respond(result, h)

      // Only a PUT that actually flips the deleted flag is a delete; a client
      // that echoes the object back unchanged needs no delete permission.
      if (action === 'write' && request.payload?.deleted !== undefined) {
        const wasDeleted = !await Authz.isActiveObject(resource, objectId)
        if (Boolean(request.payload.deleted) !== wasDeleted) {
          const deleteResult = await Authz.checkPermission(
            credentials, resource, 'delete', objectId,
          )
          return respond(deleteResult, h)
        }
      }

      return respond(result, h)
    })
  },
}

function respond(result, h) {
  if (result.allowed) return h.continue
  return h.response({
    error_code: result.code,
    error_msg: result.msg,
  }).code(403).takeover()
}

function resolveId(request, idFrom) {
  const [source, key] = idFrom.split('.')
  if (source === 'params') return request.params[key]
  if (source === 'payload') return request.payload?.[key]
  if (source === 'query') return request.query?.[key]
}

// The group a create lands in must be read from the same payload key the store
// persists, or authz and the store can be pointed at different groups.
const CREATE_GROUP_KEY = {
  group: 'parent_gid',
  nameserver: 'gid',
  user: 'gid',
  zone: 'gid',
}

async function resolveTargetGroup(request, resource) {
  if (resource === 'zonerecord') {
    const zid = request.payload?.zid ?? request.payload?.nt_zone_id
    if (zid) {
      const zones = await Zone.get({ id: Number(zid) })
      const zone = zones.find((z) => z.deleted !== true)
      if (zone) return { gid: zone.gid, zid: Number(zid) }
    }
    return null
  }

  const key = CREATE_GROUP_KEY[resource]
  if (!key) return null
  const gid = request.payload?.[key]
  if (gid) return { gid: Number(gid) }

  return null
}

async function movedFromZone(request, resource, action, objectId) {
  if (resource !== 'zonerecord' || action !== 'write') return null
  if (objectId === undefined || request.payload?.zid === undefined) return null
  const records = await ZoneRecord.get({ id: objectId })
  if (records.length === 0) return null
  return records[0].zid !== Number(request.payload.zid) ? records[0].zid : null
}

export default authzPlugin
