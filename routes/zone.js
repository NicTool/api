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
        const deleted = request.query.deleted === true
        const getArgs = {
          deleted,
          limit: Number.isInteger(request.query.limit) ? request.query.limit : 1000,
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)
        if (request.query.search) getArgs.search = request.query.search
        if (Number.isInteger(request.query.offset)) getArgs.offset = request.query.offset
        if (request.query.zone_like) getArgs.zone_like = request.query.zone_like
        if (request.query.description_like) getArgs.description_like = request.query.description_like
        if (request.query.sort_by) getArgs.sort_by = request.query.sort_by
        if (request.query.sort_dir) getArgs.sort_dir = request.query.sort_dir

        const countArgs = {
          deleted,
          ...(getArgs.id ? { id: getArgs.id } : {}),
          ...(getArgs.search ? { search: getArgs.search } : {}),
          ...(getArgs.zone_like ? { zone_like: getArgs.zone_like } : {}),
          ...(getArgs.description_like ? { description_like: getArgs.description_like } : {}),
        }

        const [zones, filtered, total] = await Promise.all([
          Zone.get(getArgs),
          Zone.count(countArgs),
          Zone.count(getArgs.id ? { deleted, id: getArgs.id } : { deleted }),
        ])

        return h
          .response({
            zone: zones,
            meta: {
              api: meta.api,
              msg: `here's your zone(s)`,
              pagination: {
                total,
                filtered,
                limit: getArgs.limit,
                offset: getArgs.offset ?? 0,
              },
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
          deleted: request.query.deleted === true,
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
