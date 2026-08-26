import validate from '@nictool/validate'

import Audit from '../lib/audit/index.js'
import Group from '../lib/group/index.js'
import { meta } from '../lib/util.js'

function LogRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/log/global',
      options: groupLogOptions(validate.log.GET_global_req),
      handler: async (request, h) => {
        const gids = await groupScope(request)
        return logResponse(h, await Audit.listGlobal({ ...request.query, gids }))
      },
    },
    {
      method: 'GET',
      path: '/log/zone',
      options: groupLogOptions(validate.log.GET_zone_req),
      handler: async (request, h) => {
        const gids = await groupScope(request)
        return logResponse(h, await Audit.listZones({ ...request.query, gids }))
      },
    },
    {
      method: 'GET',
      path: '/log/zone_record',
      options: {
        app: { permission: { resource: 'zone', action: 'read', idFrom: 'query.zid' } },
        validate: { query: validate.log.GET_zone_record_req },
        response: { schema: validate.log.GET_res },
        tags: ['api'],
      },
      handler: async (request, h) => logResponse(h, await Audit.listZoneRecords(request.query)),
    },
  ])
}

function groupLogOptions(querySchema) {
  return {
    app: {
      permission: {
        resource: 'log',
        action: 'read',
        list: { resource: 'group', idFrom: 'query.gid', defaultToGroup: true },
      },
    },
    validate: { query: querySchema },
    response: { schema: validate.log.GET_res },
    tags: ['api'],
  }
}

async function groupScope(request) {
  const gid = request.query.gid ?? request.auth.credentials.group.id
  return request.query.include_subgroups === true ? Group.subgroupGids(gid) : [gid]
}

function logResponse(h, result) {
  return h
    .response({
      log: result.rows,
      meta: {
        api: meta.api,
        msg: 'audit entries',
        pagination: {
          total: result.total,
          filtered: result.filtered,
          limit: result.limit,
          offset: result.offset,
        },
      },
    })
    .code(200)
}

export default LogRoutes

export { LogRoutes }
