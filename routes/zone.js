import validate from '@nictool/validate'

import Zone from '../lib/zone/index.js'
import Group from '../lib/group/index.js'
import Authz from '../lib/authz.js'
import Mysql from '../lib/mysql.js'
import Audit from '../lib/audit.js'
import { meta } from '../lib/util.js'

const ZONE_PUT_FIELDS = new Set([
  'gid', 'description', 'mailaddr', 'serial', 'ttl', 'refresh', 'retry', 'expire', 'minimum',
  'deleted',
])

function ZoneRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/zone/{id?}',
      options: {
        app: {
          permission: {
            resource: 'zone',
            action: 'read',
            idFrom: 'params.id',
            list: { resource: 'group', idFrom: 'query.gid', defaultToGroup: true },
          },
        },
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
          limit: Number.isInteger(request.query.limit) ? request.query.limit : 1000,
        }
        if (request.query.deleted !== undefined) {
          getArgs.deleted = request.query.deleted === true
        }
        if (request.params.id) getArgs.id = parseInt(request.params.id, 10)
        if (!request.params.id && request.query.gid == null) {
          getArgs.gid = request.auth.credentials.group.id
        }
        if (request.query.gid != null) {
          const gid = Number.isInteger(request.query.gid)
            ? request.query.gid
            : parseInt(`${request.query.gid}`, 10)
          if (Number.isInteger(gid) && gid > 0) getArgs.gid = gid
        }
        if (request.query.search) getArgs.search = request.query.search
        if (Number.isInteger(request.query.offset)) getArgs.offset = request.query.offset
        if (request.query.zone_like) getArgs.zone_like = request.query.zone_like
        if (request.query.description_like) getArgs.description_like = request.query.description_like
        if (request.query.sort_by) getArgs.sort_by = request.query.sort_by
        if (request.query.sort_dir) getArgs.sort_dir = request.query.sort_dir

        if (request.query.include_subgroups === true && getArgs.gid) {
          getArgs.gid = await Group.subgroupGids(getArgs.gid)
        }

        if (!getArgs.id && getArgs.gid !== undefined) {
          getArgs.accessible_ids = await Authz.getDelegatedZoneIds(getArgs.gid)
        }

        const deleted = getArgs.deleted ?? false
        const countArgs = {
          deleted,
          ...(getArgs.id ? { id: getArgs.id } : {}),
          ...(getArgs.gid ? { gid: getArgs.gid } : {}),
          ...(getArgs.accessible_ids ? { accessible_ids: getArgs.accessible_ids } : {}),
          ...(getArgs.search ? { search: getArgs.search } : {}),
          ...(getArgs.zone_like ? { zone_like: getArgs.zone_like } : {}),
          ...(getArgs.description_like ? { description_like: getArgs.description_like } : {}),
        }
        const totalArgs = {
          deleted,
          ...(getArgs.id ? { id: getArgs.id } : {}),
          ...(getArgs.gid ? { gid: getArgs.gid } : {}),
          ...(getArgs.accessible_ids ? { accessible_ids: getArgs.accessible_ids } : {}),
        }

        const [zones, filtered, total] = await Promise.all([
          Zone.get(getArgs),
          Zone.count(countArgs),
          Zone.count(totalArgs),
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
        app: { permission: { resource: 'zone', action: 'create' } },
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
        await Audit.logZone(request.auth.credentials.user, 'added', zones[0])

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
      method: 'PUT',
      path: '/zone/{id}',
      options: {
        app: {
          permission: {
            resource: 'zone',
            action: 'write',
            idFrom: 'params.id',
            targetGroupFrom: 'payload.gid',
          },
        },
        validate: {
          payload: validate.zone.PUT,
          options: { allowUnknown: true },
        },
        response: {
          schema: validate.zone.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        let zones = await Zone.get({ id })
        if (zones.length === 0) zones = await Zone.get({ id, deleted: 1 })

        if (zones.length === 0) {
          return h.response({ meta: { api: meta.api, msg: `I couldn't find that zone` } }).code(404)
        }

        const payload = Object.fromEntries(
          Object.entries(request.payload).filter(([key]) => ZONE_PUT_FIELDS.has(key)),
        )
        await Zone.put({ id, ...payload })

        let updated = await Zone.get({ id })
        if (updated.length === 0) updated = await Zone.get({ id, deleted: true })
        await Audit.logZone(
          request.auth.credentials.user,
          zoneAuditAction(zones[0], payload),
          updated[0],
          zones[0],
        )
        return h.response({ zone: updated, meta: { api: meta.api, msg: `the zone was updated` } }).code(200)
      },
    },
    {
      method: 'GET',
      path: '/zone/{id}/ns',
      options: {
        app: { permission: { resource: 'zone', action: 'read', idFrom: 'params.id' } },
        response: {
          schema: validate.zone.GET_ns_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const zid = parseInt(request.params.id, 10)

        const nsRows = await Mysql.execute(
          `SELECT z.zone, n.name, n.ttl
             FROM nt_zone_nameserver nzns
             JOIN nt_nameserver n ON n.nt_nameserver_id = nzns.nt_nameserver_id
             JOIN nt_zone z       ON z.nt_zone_id       = nzns.nt_zone_id
            WHERE nzns.nt_zone_id = ?
            ORDER BY n.name`,
          [zid],
        )

        const ns = nsRows.map((row) => {
          const zoneFqdn = row.zone.endsWith('.') ? row.zone : `${row.zone}.`
          const dname = row.name.endsWith('.') ? row.name : `${row.name}.`
          return { owner: zoneFqdn, ttl: row.ttl, dname }
        })

        return h.response({ ns, meta: { api: meta.api, msg: `here are the NS records` } }).code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/zone/{id}',
      options: {
        app: { permission: { resource: 'zone', action: 'delete', idFrom: 'params.id' } },
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
        await Audit.logZone(request.auth.credentials.user, 'deleted', zones[0])

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

function zoneAuditAction(previous, payload) {
  if (payload.deleted === true && previous.deleted !== true) return 'deleted'
  if (payload.deleted === false && previous.deleted === true) return 'recovered'
  if (payload.gid !== undefined && payload.gid !== previous.gid) return 'moved'
  return 'modified'
}

export default ZoneRoutes

export { Zone, ZoneRoutes }
