import validate from '@nictool/validate'

import Nameserver from '../lib/nameserver/index.js'
import { meta } from '../lib/util.js'

function NameserverRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/nameserver/{id?}',
      options: {
        app: {
          permission: {
            resource: 'nameserver',
            action: 'read',
            idFrom: 'params.id',
            list: { resource: 'group', idFrom: 'query.gid', defaultToGroup: true },
          },
        },
        validate: {
          query: validate.nameserver.GET_req,
        },
        response: {
          schema: validate.nameserver.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {}
        if (request.query.deleted !== undefined) {
          getArgs.deleted = request.query.deleted === true
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)
        // authz has already scoped a single-object fetch, which may resolve
        // through a usable_ns grant on a nameserver outside the caller's group
        if (request.query.gid !== undefined) {
          getArgs.gid = parseInt(request.query.gid, 10)
        } else if (!request.params.id) {
          getArgs.gid = request.auth.credentials.group.id
        }

        const nameservers = await Nameserver.get(getArgs)

        return h
          .response({
            nameserver: nameservers,
            meta: {
              api: meta.api,
              msg: `here's your nameserver`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/nameserver',
      options: {
        app: { permission: { resource: 'nameserver', action: 'create' } },
        validate: {
          payload: validate.nameserver.POST,
        },
        response: {
          schema: validate.nameserver.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = await Nameserver.create(request.payload)

        const nameservers = await Nameserver.get({ id })

        return h
          .response({
            nameserver: nameservers,
            meta: {
              api: meta.api,
              msg: `the nameserver was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'PUT',
      path: '/nameserver/{id}',
      options: {
        app: {
          permission: {
            resource: 'nameserver',
            action: 'write',
            idFrom: 'params.id',
            targetGroupFrom: 'payload.gid',
          },
        },
        validate: {
          payload: validate.nameserver.PUT,
        },
        response: {
          schema: validate.nameserver.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        let nameservers = await Nameserver.get({ id })
        if (nameservers.length === 0) nameservers = await Nameserver.get({ id, deleted: 1 })

        if (nameservers.length === 0) {
          return h.response({ meta: { api: meta.api, msg: `I couldn't find that nameserver` } }).code(404)
        }

        await Nameserver.put({ id, ...request.payload })

        const updated = await Nameserver.get({ id })
        return h
          .response({ nameserver: updated, meta: { api: meta.api, msg: `the nameserver was updated` } })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/nameserver/{id}',
      options: {
        app: { permission: { resource: 'nameserver', action: 'delete', idFrom: 'params.id' } },
        validate: {
          query: validate.nameserver.DELETE,
        },
        response: {
          schema: validate.nameserver.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const nameservers = await Nameserver.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (nameservers.length === 0) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `I couldn't find that nameserver`,
              },
            })
            .code(404)
        }

        await Nameserver.delete({
          id: nameservers[0].id,
          deleted: 1,
        })

        return h
          .response({
            nameserver: nameservers,
            meta: {
              api: meta.api,
              msg: `I deleted that nameserver`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default NameserverRoutes

export { Nameserver, NameserverRoutes }
