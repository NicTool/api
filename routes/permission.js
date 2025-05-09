import validate from '@nictool/validate'

import Permission from '../lib/permission.js'
import { meta } from '../lib/util.js'

function PermissionRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/permission/{id}',
      options: {
        validate: {
          query: validate.permission.GET_req,
          failAction: 'log',
        },
        response: {
          schema: validate.permission.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        }

        const permission = await Permission.get(getArgs)

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `here's your permission`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/permission',
      options: {
        validate: {
          payload: validate.permission.POST,
          failAction: 'log',
        },
        response: {
          schema: validate.permission.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const pid = await Permission.create(request.payload)

        const permission = await Permission.get({ id: pid })

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `the permission was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'DELETE',
      path: '/permission/{id}',
      options: {
        validate: {
          query: validate.permission.DELETE,
          failAction: 'log',
        },
        response: {
          schema: validate.permission.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const permission = await Permission.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (!permission) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `I couldn't find that permission`,
              },
            })
            .code(404)
        }

        await Permission.delete({
          id: permission.id,
          deleted: 1,
        })

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `I deleted that permission`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default PermissionRoutes

export { Permission, PermissionRoutes }
