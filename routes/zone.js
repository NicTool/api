import validate from '@nictool/validate'

import Zone from '../lib/zone.js'
import { meta } from '../lib/util.js'

function ZoneRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/zone/{id}',
      options: {
        validate: {
          query: validate.zone.GET_req,
        },
        response: {
          schema: validate.zone.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        }

        const zones = await Zone.get(getArgs)

        return h
          .response({
            zone: zones[0],
            meta: {
              api: meta.api,
              msg: `here's your zone`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/zone',
      options: {
        validate: {
          payload: validate.zone.POST,
        },
        response: {
          schema: validate.zone.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = await Zone.create(request.payload)

        const zones = await Zone.get({ id })

        return h
          .response({
            zone: zones[0],
            meta: {
              api: meta.api,
              msg: `the zone was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'DELETE',
      path: '/zone/{id}',
      options: {
        validate: {
          query: validate.zone.DELETE,
        },
        response: {
          schema: validate.zone.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const zones = await Zone.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (zones.length === 0) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `I couldn't find that zone`,
              },
            })
            .code(404)
        }

        await Zone.delete({
          id: zones[0].id,
          deleted: 1,
        })

        return h
          .response({
            zone: zones[0],
            meta: {
              api: meta.api,
              msg: `I deleted that zone`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default ZoneRoutes

export { Zone, ZoneRoutes }
