import validate from '@nictool/validate'

import Group from '../lib/group/index.js'
import Authz from '../lib/authz.js'
import Permission from '../lib/permission.js'
import { meta } from '../lib/util.js'

const PERM_FIELDS = new Set([
  'group_write', 'group_create', 'group_delete',
  'zone_write', 'zone_create', 'zone_delegate', 'zone_delete',
  'zonerecord_write', 'zonerecord_create', 'zonerecord_delegate', 'zonerecord_delete',
  'user_write', 'user_create', 'user_delete',
  'nameserver_write', 'nameserver_create', 'nameserver_delete',
  'self_write', 'usable_ns',
])

function extractPermFields(payload) {
  const permFields = {}
  for (const key of Object.keys(payload)) {
    if (PERM_FIELDS.has(key)) {
      permFields[key] = payload[key]
      delete payload[key]
    }
  }
  return permFields
}

function GroupRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/group',
      options: {
        validate: {
          query: validate.group.GET_list_req,
        },
        response: {
          schema: validate.group.GET_list_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          include_subgroups: request.query.include_subgroups === true,
        }
        if (request.query.parent_gid !== undefined) getArgs.parent_gid = request.query.parent_gid
        if (request.query.name     !== undefined) getArgs.name       = request.query.name

        const groups = await Group.get(getArgs)

        return h
          .response({ group: groups, meta: { api: meta.api, msg: `here are your groups` } })
          .code(200)
      },
    },
    {
      method: 'GET',
      path: '/group/{id}',
      options: {
        app: { permission: { resource: 'group', action: 'read', idFrom: 'params.id' } },
        validate: {
          query: validate.group.GET_req,
        },
        response: {
          schema: validate.group.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          id: parseInt(request.params.id, 10),
          include_subgroups: request.query.include_subgroups === true,
        }
        if (request.query.deleted !== undefined) {
          getArgs.deleted = request.query.deleted === true
        }
        const groups = await Group.get(getArgs)

        if (groups.length !== 1 && !request.query.include_subgroups) {
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
            group: request.query.include_subgroups ? groups : groups[0],
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
        app: { permission: { resource: 'group', action: 'create' } },
        validate: {
          payload: validate.group.POST,
          options: { allowUnknown: true },
        },
        response: {
          schema: validate.group.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const userPerm = await Permission.getEffective(user.id)
        request.payload = Authz.capPermissions(userPerm, request.payload)

        const permFields = extractPermFields(request.payload)
        const gid = await Group.create(request.payload)

        if (Object.keys(permFields).length > 0) {
          const perm = await Permission.get({ gid })
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

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
      method: 'PUT',
      path: '/group/{id}',
      options: {
        app: { permission: { resource: 'group', action: 'write', idFrom: 'params.id' } },
        validate: {
          payload: validate.group.PUT,
          options: { allowUnknown: true },
        },
        response: {
          schema: validate.group.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        const { user } = request.auth.credentials
        const userPerm = await Permission.getEffective(user.id)
        request.payload = Authz.capPermissions(userPerm, request.payload)

        const permFields = extractPermFields(request.payload)
        if (Object.keys(permFields).length > 0) {
          const perm = await Permission.get({ gid: id })
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

        await Group.put({ ...request.payload, id })

        const groups = await Group.get({ id })

        return h
          .response({
            group: groups[0],
            meta: {
              api: meta.api,
              msg: `I updated this group`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/group/{id}',
      options: {
        app: { permission: { resource: 'group', action: 'delete', idFrom: 'params.id' } },
        validate: {
          query: validate.group.DELETE,
        },
        response: {
          schema: validate.group.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        const groups = await Group.get({ id })
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

        const [zoneCount, userCount, subgroupCount] = await Promise.all([
          Group.mysql.execute('SELECT COUNT(*) AS count FROM nt_zone WHERE nt_group_id = ? AND deleted = 0', [id]),
          Group.mysql.execute('SELECT COUNT(*) AS count FROM nt_user WHERE nt_group_id = ? AND deleted = 0', [id]),
          Group.mysql.execute('SELECT COUNT(*) AS count FROM nt_group WHERE parent_group_id = ? AND deleted = 0', [id]),
        ])
        if (zoneCount[0].count > 0) {
          return h.response({ error: 'Cannot delete group: active zones still exist.' }).code(409)
        }
        if (userCount[0].count > 0) {
          return h.response({ error: 'Cannot delete group: active users still exist.' }).code(409)
        }
        if (subgroupCount[0].count > 0) {
          return h.response({ error: 'Cannot delete group: active subgroups still exist.' }).code(409)
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
