import validate from '@nictool/validate'

import ZoneRecord from '../lib/zone_record.js'
import { meta } from '../lib/util.js'

function ZoneRecordRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/zone_record/{id?}',
      options: {
        validate: {
          query: validate.zone_record.GET_req,
          failAction: 'log',
        },
        response: {
          schema: validate.zone_record.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)
        if (request.query.zid) getArgs.zid = parseInt(request.query.zid, 10)

        const zrs = await ZoneRecord.get(getArgs)

        return h
          .response({
            zone_record: zrs,
            meta: {
              api: meta.api,
              msg: `here's your zone record(s)`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/zone_record',
      options: {
        validate: {
          payload: validate.zone_record.POST,
        },
        response: {
          schema: validate.zone_record.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = await ZoneRecord.create(request.payload)

        const zrs = await ZoneRecord.get({ id })

        return h
          .response({
            zone_record: zrs[0],
            meta: {
              api: meta.api,
              msg: `the zone record was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'DELETE',
      path: '/zone_record/{id}',
      options: {
        validate: {
          query: validate.zone_record.DELETE,
        },
        response: {
          schema: validate.zone_record.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const zrs = await ZoneRecord.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (zrs.length === 0) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `I couldn't find that zone record`,
              },
            })
            .code(404)
        }

        const r = await ZoneRecord.delete({
          id: zrs[0].id,
          deleted: 1,
        })
        console.log(`deleted`, r)

        return h
          .response({
            zone: zrs[0],
            meta: {
              api: meta.api,
              msg: `I deleted that zone record`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default ZoneRecordRoutes

export { ZoneRecord, ZoneRecordRoutes }
