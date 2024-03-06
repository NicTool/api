import validate from '@nictool/validate'

import Group from '../lib/group.js'
import { meta } from '../lib/util.js'

function GroupRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/group/{id}',
      options: {
        validate: {
          query: validate.group.GET_req,
        },
        response: {
          schema: validate.group.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const groups = await Group.get({
          deleted: request.query.deleted ?? 0,
          id: parseInt(request.params.id, 10),
        })

        if (groups.length !== 1) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `No unique group match`,
              },
            })
            .code(204)
        }

        return h
          .response({
            group: groups[0],
            meta: {
              api: meta.api,
              msg: `here's your group`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/group',
      options: {
        validate: {
          payload: validate.group.POST,
        },
        response: {
          schema: validate.group.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const gid = await Group.create(request.payload)

        const groups = await Group.get({ id: gid })

        return h
          .response({
            group: groups[0],
            meta: {
              api: meta.api,
              msg: `I created this group`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'DELETE',
      path: '/group/{id}',
      options: {
        validate: {
          query: validate.group.DELETE,
        },
        response: {
          schema: validate.group.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {

        const groups = await Group.get({ id: parseInt(request.params.id, 10) })
        /* c8 ignore next 10 */
        if (groups.length !== 1) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `No unique group match`,
              },
            })
            .code(204)
        }

        await Group.delete({ id: groups[0].id })
        delete groups[0].gid

        return h
          .response({
            group: groups[0],
            meta: {
              api: meta.api,
              msg: `I deleted that group`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default GroupRoutes
