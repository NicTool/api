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
          // params: ??,
          query: validate.permission.GET,
        },
        response: {
          schema: validate.permission.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        // console.log(request.params)

        const permission = await Permission.get({
          deleted: request.query.deleted ?? 0,
          id: parseInt(request.params.id, 10),
        })

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
        },
        response: {
          schema: validate.permission.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const pid = await Permission.create(request.payload)
        if (!pid) {
          console.log(`POST /permission oops`) // TODO
        }

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
        // response: {
        //   schema: validate.permission.GET,
        // },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const permission = await Permission.get({
          deleted: parseInt(request.query.deleted ?? 0),
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

        const action = request.query.destroy === 'true' ? 'destroy' : 'delete'
        // console.log(`action: ${action}`)
        await Permission[action]({
          id: permission.id,
          deleted: permission.deleted,
        })
        delete permission.gid

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
