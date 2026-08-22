import validate from '@nictool/validate'

import Authz from '../lib/authz.js'
import Delegation from '../lib/delegation.js'
import Permission from '../lib/permission/index.js'
import { meta } from '../lib/util.js'

const DELEGABLE_RESOURCE = {
  ZONE: 'zone',
  ZONERECORD: 'zonerecord',
}

const DELEG_PERM_CAP = {
  ZONE: {
    perm_write: ['zone', 'write'],
    perm_delegate: ['zone', 'delegate'],
    zone_perm_add_records: ['zonerecord', 'create'],
    zone_perm_delete_records: ['zonerecord', 'delete'],
  },
  ZONERECORD: {
    perm_write: ['zonerecord', 'write'],
    perm_delegate: ['zonerecord', 'delegate'],
  },
}

function capDelegationPerms(payload, perm, sourceDelegation, mode) {
  const capMap = DELEG_PERM_CAP[payload.type]
  if (!capMap) return
  for (const [field, [resource, action]] of Object.entries(capMap)) {
    if (payload[field] === undefined) continue
    if (
      perm[resource]?.[action] !== true
      || (sourceDelegation && sourceDelegation[field] !== 1)
    ) {
      if (mode === 'create') payload[field] = false
      else delete payload[field]
    }
  }
}

function DelegationRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/delegation',
      options: {
        app: { permission: { resource: 'zone', action: 'readDelegation' } },
        validate: {
          query: validate.delegation.GET_req,
        },
        response: {
          schema: validate.delegation.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {}
        if (request.query.gid !== undefined) getArgs.gid = request.query.gid
        if (request.query.oid !== undefined) getArgs.oid = request.query.oid
        if (request.query.type !== undefined) getArgs.type = request.query.type

        const delegation = await Delegation.get(getArgs)

        return h
          .response({
            delegation,
            meta: {
              api: meta.api,
              msg: `here are your delegations`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/delegation',
      options: {
        app: { permission: { resource: 'zone', action: 'delegate', idFrom: 'payload.oid' } },
        validate: {
          payload: validate.delegation.POST,
          options: { noDefaults: true },
        },
        response: {
          schema: validate.delegation.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const perm = await Permission.getEffective(user.id)
        const sourceDelegation = await sourceDelegationFor(request)
        capDelegationPerms(request.payload, perm, sourceDelegation, 'create')
        setActor(request)

        const result = await Delegation.create(request.payload)

        if (result.duplicate) {
          return h
            .response({
              delegation: [],
              meta: {
                api: meta.api,
                msg: `that delegation already exists`,
              },
            })
            .code(409)
        }

        const delegation = await Delegation.get({
          gid: request.payload.gid,
          oid: request.payload.oid,
          type: request.payload.type,
        })

        return h
          .response({
            delegation,
            meta: {
              api: meta.api,
              msg: `the delegation was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'PUT',
      path: '/delegation',
      options: {
        app: { permission: { resource: 'zone', action: 'editDelegation', idFrom: 'payload.oid' } },
        validate: {
          payload: validate.delegation.PUT,
        },
        response: {
          schema: validate.delegation.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const perm = await Permission.getEffective(user.id)
        capDelegationPerms(request.payload, perm, null, 'edit')
        setActor(request)

        const result = await Delegation.put(request.payload)

        if (result === null) {
          return h
            .response({
              delegation: [],
              meta: {
                api: meta.api,
                msg: `I couldn't find that delegation`,
              },
            })
            .code(404)
        }

        const delegation = await Delegation.get({
          gid: request.payload.gid,
          oid: request.payload.oid,
          type: request.payload.type,
        })

        return h
          .response({
            delegation,
            meta: {
              api: meta.api,
              msg: `the delegation was updated`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/delegation',
      options: {
        app: { permission: { resource: 'zone', action: 'deleteDelegation', idFrom: 'query.oid' } },
        validate: {
          query: validate.delegation.DELETE,
        },
        response: {
          schema: validate.delegation.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const args = {
          gid: request.query.gid,
          oid: request.query.oid,
          type: request.query.type,
          delegated_by_id: request.auth.credentials.user.id,
          delegated_by_name: request.auth.credentials.user.username,
        }

        const result = await Delegation.delete(args)

        if (result === null) {
          return h
            .response({
              delegation: [],
              meta: {
                api: meta.api,
                msg: `I couldn't find that delegation`,
              },
            })
            .code(404)
        }

        return h
          .response({
            delegation: [],
            meta: {
              api: meta.api,
              msg: `I deleted that delegation`,
            },
          })
          .code(200)
      },
    },
  ])
}

function setActor(request) {
  request.payload.delegated_by_id = request.auth.credentials.user.id
  request.payload.delegated_by_name = request.auth.credentials.user.username
}

async function sourceDelegationFor(request) {
  const resource = DELEGABLE_RESOURCE[request.payload.type]
  if (!resource) return null
  const gid = await Authz.getObjectGroupId(resource, request.payload.oid)
  if (gid !== null && await Authz.isInGroupTree(request.auth.credentials.group.id, gid)) {
    return null
  }
  return Authz.getDelegateAccess(
    request.auth.credentials.group.id,
    request.payload.oid,
    resource,
  )
}

export default DelegationRoutes

export { Delegation, DelegationRoutes }
