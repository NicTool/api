import validate from '@nictool/validate'

import Nameserver from '../lib/nameserver.js'
import { meta } from '../lib/util.js'

function NameserverRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/nameserver/{id}',
      options: {
        validate: {
          query: validate.nameserver.v3,
        },
        response: {
          schema: validate.nameserver.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        }

        const nameservers = await Nameserver.get(getArgs)

        return h
          .response({
            nameserver: nameservers[0],
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
        validate: {
          payload: validate.nameserver.POST,
        },
        response: {
          schema: validate.nameserver.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = await Nameserver.create(request.payload)

        const nameservers = await Nameserver.get({ id })

        return h
          .response({
            nameserver: nameservers[0],
            meta: {
              api: meta.api,
              msg: `the nameserver was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'DELETE',
      path: '/nameserver/{id}',
      options: {
        validate: {
          query: validate.nameserver.DELETE,
        },
        response: {
          schema: validate.nameserver.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const nameservers = await Nameserver.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (!nameservers) {
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
            nameserver: nameservers[0],
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
