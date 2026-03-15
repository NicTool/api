import validate from '@nictool/validate'

import Zone from '../lib/zone.js'
import { meta } from '../lib/util.js'

function zoneResponseFailAction(request, h, err) {
  const detail = err?.details?.find(
    (d) => Array.isArray(d.path) && d.path[0] === 'zone' && d.path[2] === 'zone',
  )

  if (detail) {
    const index = detail.path[1]
    const badZone = request.response?.source?.zone?.[index]?.zone
    const badId = request.response?.source?.zone?.[index]?.id

    if (badZone !== undefined) {
      err.message = `${err.message}. Invalid zone value: "${badZone}" (id: ${badId ?? 'unknown'})`
    }
  }

  throw err
}

function ZoneRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/zone/{id?}',
      options: {
        validate: {
          query: validate.zone.GET_req,
          failAction: 'log',
        },
        response: {
          schema: validate.zone.GET_res,
          failAction: zoneResponseFailAction,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          limit: 1000,
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)

        const zones = await Zone.get(getArgs)

        return h
          .response({
            zone: zones,
            meta: {
              api: meta.api,
              msg: `here's your zone(s)`,
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
          failAction: 'log',
        },
        response: {
          schema: validate.zone.GET_res,
          failAction: zoneResponseFailAction,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = await Zone.create(request.payload)

        const zones = await Zone.get({ id })

        return h
          .response({
            zone: zones,
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
          failAction: 'log',
        },
        response: {
          schema: validate.zone.GET_res,
          failAction: zoneResponseFailAction,
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
            zone: zones,
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
