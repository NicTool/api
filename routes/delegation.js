import validate from '@nictool/validate'

import Delegation from '../lib/delegation.js'
import Permission from '../lib/permission.js'
import { meta } from '../lib/util.js'

const DELEG_PERM_CAP = {
  ZONE: {
    perm_write: ['zone', 'write'],
    perm_delete: ['zone', 'delete'],
    perm_delegate: ['zone', 'delegate'],
    zone_perm_add_records: ['zonerecord', 'create'],
    zone_perm_delete_records: ['zonerecord', 'delete'],
  },
  ZONERECORD: {
    perm_write: ['zonerecord', 'write'],
    perm_delete: ['zonerecord', 'delete'],
    perm_delegate: ['zonerecord', 'delegate'],
  },
}

function capDelegationPerms(payload, perm, mode) {
  const capMap = DELEG_PERM_CAP[payload.type]
  if (!capMap) return
  for (const [field, [resource, action]] of Object.entries(capMap)) {
    if (payload[field] === undefined) continue
    if (perm[resource]?.[action] !== true) {
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
        },
        response: {
          schema: validate.delegation.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const perm = await Permission.getEffective(user.id)
        capDelegationPerms(request.payload, perm, 'create')

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
        app: { permission: { resource: 'zone', action: 'delegate', idFrom: 'payload.oid' } },
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
        capDelegationPerms(request.payload, perm, 'edit')

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
        app: { permission: { resource: 'zone', action: 'delegate', idFrom: 'query.oid' } },
        validate: {
          query: validate.delegation.DELETE,
          failAction: 'log',
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

export default DelegationRoutes

export { Delegation, DelegationRoutes }
