import validate from '@nictool/validate'

import Group from '../lib/group/index.js'
import User from '../lib/user/index.js'
import Zone from '../lib/zone/index.js'
import Authz from '../lib/authz.js'
import Permission from '../lib/permission/index.js'
import { meta } from '../lib/util.js'

const PERM_FIELDS = new Set([
  'group_write', 'group_create', 'group_delete',
  'zone_write', 'zone_create', 'zone_delegate', 'zone_delete',
  'zonerecord_write', 'zonerecord_create', 'zonerecord_delegate', 'zonerecord_delete',
  'user_write', 'user_create', 'user_delete',
  'nameserver_write', 'nameserver_create', 'nameserver_delete',
  'self_write', 'usable_ns',
])

const GROUP_POST_FIELDS = new Set([
  'id', 'name', 'parent_gid', 'deleted', 'usable_ns',
])

const GROUP_PUT_FIELDS = new Set([
  'name', 'parent_gid', 'deleted', 'usable_ns',
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

function pickFields(payload, fields) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => fields.has(key)))
}

function GroupRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/group',
      options: {
        app: {
          permission: {
            resource: 'group',
            action: 'read',
            list: { resource: 'group', idFrom: 'query.parent_gid', defaultToGroup: true },
          },
        },
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
        getArgs.parent_gid = request.query.parent_gid ?? request.auth.credentials.group.id
        if (request.query.name !== undefined) getArgs.name = request.query.name

        const groups = await Group.get(getArgs)

        return h.response({ group: groups, meta: { api: meta.api, msg: `here are your groups` } }).code(200)
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

        // Return an array like the other object types (zone/nameserver/user/
        // zone_record) rather than a bare object, for a consistent API contract.
        return h
          .response({
            group: groups,
            meta: {
              api: meta.api,
              msg: `here's your group(s)`,
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
        const gid = await Group.create(pickFields(request.payload, GROUP_POST_FIELDS))

        if (Object.keys(permFields).length > 0) {
          const perm = await Permission.get({ gid })
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

        const groups = await Group.get({ id: gid })

        return h
          .response({
            group: groups,
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
        app: {
          permission: {
            resource: 'group',
            action: 'write',
            idFrom: 'params.id',
            targetGroupFrom: 'payload.parent_gid',
          },
        },
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
        const existingPerm = await Permission.get({ gid: id })
        request.payload = Authz.capPermissions(userPerm, request.payload, existingPerm)

        const permFields = extractPermFields(request.payload)
        if (Object.keys(permFields).length > 0) {
          if (existingPerm) await Permission.put({ id: existingPerm.id, ...permFields })
        }

        await Group.put({ ...pickFields(request.payload, GROUP_PUT_FIELDS), id })

        const groups = await Group.get({ id })

        return h
          .response({
            group: groups,
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

        const [zoneCount, userCount, subgroups] = await Promise.all([
          Zone.count({ gid: id }),
          User.count({ gid: id }),
          Group.get({ parent_gid: id }),
        ])
        if (zoneCount > 0) {
          return h.response({ error: 'Cannot delete group: active zones still exist.' }).code(409)
        }
        if (userCount > 0) {
          return h.response({ error: 'Cannot delete group: active users still exist.' }).code(409)
        }
        if (subgroups.length > 0) {
          return h.response({ error: 'Cannot delete group: active subgroups still exist.' }).code(409)
        }

        await Group.delete({ id: groups[0].id })
        delete groups[0].gid

        return h
          .response({
            group: groups,
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
