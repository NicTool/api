import validate from '@nictool/validate'

import ZoneRecord from '../lib/zone_record/index.js'
import Zone from '../lib/zone/index.js'
import Authz from '../lib/authz/index.js'
import Audit from '../lib/audit/index.js'
import { pageLimit } from '../lib/page.js'
import { meta } from '../lib/util.js'

async function zoneRecordResponseFailAction(request, h, err) {
  const detail = err?.details?.find(
    (d) => Array.isArray(d.path) && d.path[0] === 'zone_record' && d.path[2] === 'owner',
  )

  if (detail) {
    const index = detail.path[1]
    const badRecord = request.response?.source?.zone_record?.[index]

    if (badRecord) {
      let zoneName = 'unknown'
      if (Number.isInteger(badRecord.zid)) {
        const zones = await Zone.get({ id: badRecord.zid, deleted: 0 })
        if (zones.length > 0) zoneName = zones[0].zone
      }

      err.message = `${err.message}. Invalid zone record owner for zone "${zoneName}" (zone id: ${badRecord.zid ?? 'unknown'}, record id: ${badRecord.id ?? 'unknown'}, owner: "${badRecord.owner ?? 'unknown'}")`
    }
  }

  throw err
}

function ZoneRecordRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/zone_record/{id?}',
      options: {
        app: {
          permission: {
            resource: 'zonerecord',
            action: 'read',
            idFrom: 'params.id',
            list: { resource: 'zone', idFrom: 'query.zid' },
          },
        },
        validate: {
          query: validate.zone_record.GET_req,
        },
        response: {
          schema: validate.zone_record.GET_res,
          failAction: zoneRecordResponseFailAction,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const deleted = request.query.deleted === true ? 1 : 0
        const getArgs = {
          deleted,
          limit: await pageLimit(request.query.limit),
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)
        if (request.query.zid) getArgs.zid = parseInt(request.query.zid, 10)
        if (request.query.search) getArgs.search = request.query.search
        if (Number.isInteger(request.query.offset)) getArgs.offset = request.query.offset
        if (request.query.sort_by) getArgs.sort_by = request.query.sort_by
        if (request.query.sort_dir) getArgs.sort_dir = request.query.sort_dir

        if (!getArgs.id && getArgs.zid) {
          const ids = await Authz.getZoneRecordReadScope(request.auth.credentials.group.id, getArgs.zid)
          if (ids !== null) getArgs.ids = ids
        }

        const scope = getArgs.id
          ? { id: getArgs.id }
          : getArgs.zid
            ? { zid: getArgs.zid, ...(getArgs.ids ? { ids: getArgs.ids } : {}) }
            : {}
        const countArgs = {
          deleted,
          ...scope,
          ...(getArgs.search ? { search: getArgs.search } : {}),
        }
        const totalArgs = { deleted, ...scope }

        const [zrs, filtered, total] = await Promise.all([
          ZoneRecord.get(getArgs),
          ZoneRecord.count(countArgs),
          ZoneRecord.count(totalArgs),
        ])

        return h
          .response({
            zone_record: zrs,
            meta: {
              api: meta.api,
              msg: `here's your zone record(s)`,
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
      path: '/zone_record',
      options: {
        app: { permission: { resource: 'zonerecord', action: 'create' } },
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
        const zones = await Zone.get({ id: zrs[0].zid })
        await Audit.logZoneRecord(request.auth.credentials.user, 'added', zrs[0], zones[0])

        return h
          .response({
            zone_record: zrs,
            meta: {
              api: meta.api,
              msg: `the zone record was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'PUT',
      path: '/zone_record/{id}',
      options: {
        app: {
          permission: {
            resource: 'zonerecord',
            action: 'write',
            idFrom: 'params.id',
            targetCreateResource: 'zonerecord',
          },
        },
        validate: {
          payload: validate.zone_record.PUT,
        },
        response: {
          schema: validate.zone_record.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        const zrs = await ZoneRecord.get({ id })

        if (zrs.length === 0) {
          return h.response({ meta: { api: meta.api, msg: `I couldn't find that zone record` } }).code(404)
        }

        await ZoneRecord.put({ id, ...request.payload })

        let updated = await ZoneRecord.get({ id })
        if (updated.length === 0) updated = await ZoneRecord.get({ id, deleted: true })
        let zones = await Zone.get({ id: updated[0].zid })
        if (zones.length === 0) zones = await Zone.get({ id: updated[0].zid, deleted: true })
        await Audit.logZoneRecord(
          request.auth.credentials.user,
          request.payload.deleted === true ? 'deleted' : 'modified',
          updated[0],
          zones[0],
          zrs[0],
        )
        return h
          .response({
            zone_record: updated,
            meta: { api: meta.api, msg: `the zone record was updated` },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/zone_record/{id}',
      options: {
        app: { permission: { resource: 'zonerecord', action: 'delete', idFrom: 'params.id' } },
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

        let zones = await Zone.get({ id: zrs[0].zid })
        if (zones.length === 0) zones = await Zone.get({ id: zrs[0].zid, deleted: true })
        if (zones.length === 0) {
          return h.response({ meta: { api: meta.api, msg: `I couldn't find that zone` } }).code(404)
        }

        await ZoneRecord.delete({
          id: zrs[0].id,
          deleted: 1,
        })
        await Audit.logZoneRecord(request.auth.credentials.user, 'deleted', zrs[0], zones[0])

        const deletedZrs = await ZoneRecord.get({
          id: zrs[0].id,
          deleted: true,
        })

        return h
          .response({
            zone_record: deletedZrs,
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
