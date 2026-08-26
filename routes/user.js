import validate from '@nictool/validate'

import User from '../lib/user/index.js'
import Credentials from '../lib/user/credentials.js'
import Authz from '../lib/authz/index.js'
import Permission from '../lib/permission/index.js'
import { pageLimit } from '../lib/page.js'
import { meta } from '../lib/util.js'

const PERM_FIELDS = new Set([
  'group_write',
  'group_create',
  'group_delete',
  'zone_write',
  'zone_create',
  'zone_delegate',
  'zone_delete',
  'zonerecord_write',
  'zonerecord_create',
  'zonerecord_delegate',
  'zonerecord_delete',
  'user_write',
  'user_create',
  'user_delete',
  'nameserver_write',
  'nameserver_create',
  'nameserver_delete',
  'self_write',
  'usable_ns',
])

const USER_POST_FIELDS = new Set([
  'id',
  'gid',
  'first_name',
  'last_name',
  'username',
  'email',
  'password',
  'inherit_group_permissions',
])

const USER_PUT_FIELDS = new Set([
  'gid',
  'first_name',
  'last_name',
  'username',
  'email',
  'password',
  'deleted',
  'inherit_group_permissions',
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

function prepareUserResponse(user) {
  const gid = parseInt(user.gid, 10)
  delete user.gid
  if (user.permissions?.group && user.permissions.group.id == null) {
    delete user.permissions.group.id
  }
  return gid
}

function UserRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/user',
      options: {
        app: {
          permission: {
            resource: 'user',
            action: 'read',
            list: { resource: 'group', idFrom: 'query.gid', defaultToGroup: true },
          },
        },
        validate: {
          query: validate.user.GET_req,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { group } = h.request.auth.credentials
        const gid = request.query.gid ?? group.id
        const getArgs = {
          gid: parseInt(gid, 10),
          deleted: request.query.deleted ?? false,
          include_subgroups: request.query.include_subgroups === true,
          limit: await pageLimit(request.query.limit),
        }

        if (request.query.search) getArgs.search = request.query.search
        if (request.query.exact_match === true) getArgs.exact_match = true
        if (Number.isInteger(request.query.offset)) getArgs.offset = request.query.offset
        if (request.query.sort_by) getArgs.sort_by = request.query.sort_by
        if (request.query.sort_dir) getArgs.sort_dir = request.query.sort_dir

        const countArgs = {
          gid: getArgs.gid,
          deleted: getArgs.deleted,
          include_subgroups: getArgs.include_subgroups,
          ...(getArgs.search ? { search: getArgs.search } : {}),
          ...(getArgs.exact_match ? { exact_match: true } : {}),
        }
        const totalArgs = {
          gid: getArgs.gid,
          deleted: getArgs.deleted,
          include_subgroups: getArgs.include_subgroups,
        }
        const [users, filtered, total] = await Promise.all([
          User.get(getArgs),
          User.count(countArgs),
          User.count(totalArgs),
        ])
        for (const u of users) prepareUserResponse(u)

        return h
          .response({
            user: users,
            meta: {
              api: meta.api,
              msg: `users in group`,
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
      method: 'GET',
      path: '/user/{id}',
      options: {
        app: { permission: { resource: 'user', action: 'read', idFrom: 'params.id' } },
        validate: {
          query: validate.user.GET_req,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = { id: parseInt(request.params.id, 10) }
        if (request.query.deleted !== undefined) {
          getArgs.deleted = request.query.deleted === true
        }
        const users = await User.get(getArgs)

        if (users.length !== 1) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `No unique user match`,
              },
            })
            .code(204)
        }

        const gid = prepareUserResponse(users[0])
        const groupPerm = await Permission.getGroup({
          uid: getArgs.id,
          deleted: false,
        })
        if (users[0].permissions && groupPerm) {
          users[0].permissions.nameserver.usable = groupPerm.nameserver?.usable ?? []
        }

        return h
          .response({
            user: users,
            group: { id: gid },
            meta: {
              api: meta.api,
              msg: `here's your user`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/user',
      options: {
        app: { permission: { resource: 'user', action: 'create' } },
        validate: {
          payload: validate.user.POST,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const userPerm = await Permission.getEffective(user.id)
        request.payload = Authz.capPermissions(userPerm, request.payload)

        const permFields = extractPermFields(request.payload)
        const uid = await User.create(pickFields(request.payload, USER_POST_FIELDS))

        if (Object.keys(permFields).length > 0) {
          const perm = await Permission.get({ uid })
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

        const users = await User.get({ id: uid })
        const group = { id: prepareUserResponse(users[0]) }

        return h
          .response({
            user: users,
            group,
            meta: {
              api: meta.api,
              msg: `I created this user`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'PUT',
      path: '/user/{id}',
      options: {
        app: {
          permission: {
            resource: 'user',
            action: 'write',
            idFrom: 'params.id',
            targetGroupFrom: 'payload.gid',
          },
        },
        validate: {
          payload: validate.user.PUT,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        const { user } = request.auth.credentials
        const userPerm = await Permission.getEffective(user.id)
        const existingPerm = await Permission.get({ uid: id })
        const gid = await Authz.getObjectGroupId('user', id)
        const groupPerm = gid === null ? null : await Permission.get({ gid })
        const effectivePerm = existingPerm?.inherit === false ? existingPerm : groupPerm
        request.payload = Authz.capPermissions(userPerm, request.payload, existingPerm)

        const hasPermFields = Object.keys(request.payload).some((field) => PERM_FIELDS.has(field))
        if (request.payload.inherit_group_permissions === false || (!existingPerm && hasPermFields)) {
          request.payload = Authz.preserveUnmanagedPermissions(userPerm, request.payload, effectivePerm)
        }

        const permFields = extractPermFields(request.payload)

        // self_write grants profile edits only; own permissions change via /permission,
        // which denies self-targeted writes
        if (id === user.id) {
          for (const field of Object.keys(permFields)) delete permFields[field]
        }

        request.payload = pickFields(request.payload, USER_PUT_FIELDS)

        // switching yourself back to inherited permissions adopts the group's,
        // which capPermissions can't cap because it isn't a permission field
        if (id === user.id) delete request.payload.inherit_group_permissions

        if (request.payload.inherit_group_permissions !== undefined) {
          const after = request.payload.inherit_group_permissions ? groupPerm : (existingPerm ?? {})
          if (!Authz.canTransitionPermissions(userPerm, effectivePerm, after)) {
            delete request.payload.inherit_group_permissions
          } else if (request.payload.inherit_group_permissions === true) {
            for (const field of Object.keys(permFields)) delete permFields[field]
          }
        }

        const args = { ...request.payload, id }

        // no salt passed: a password change always gets a fresh one
        if (args.password) {
          Object.assign(args, await Credentials.forStorage(args.password))
        }

        await User.put(args)

        if (Object.keys(permFields).length > 0) {
          let perm = await Permission.get({ uid: id })
          if (!perm) {
            const [userData] = await User.get({ id })
            const permId = await Permission.create({
              uid: id,
              gid: userData.gid,
              inherit: false,
              name: `User ${userData.username} perms`,
            })
            perm = await Permission.get({ id: permId })
          }
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

        const users = await User.get({ id })
        if (!users.length) {
          return h.response({ meta: { api: meta.api, msg: `user not found` } }).code(404)
        }
        prepareUserResponse(users[0])

        return h
          .response({
            user: users,
            meta: { api: meta.api, msg: `user updated` },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/user/{id}',
      options: {
        app: { permission: { resource: 'user', action: 'delete', idFrom: 'params.id' } },
        validate: {
          query: validate.user.DELETE,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const users = await User.get({ id: parseInt(request.params.id, 10) })
        if (users.length !== 1) {
          /* c8 ignore next 8 */
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `No unique user match`,
              },
            })
            .code(204)
        }

        await User.delete({ id: users[0].id })

        prepareUserResponse(users[0])

        return h
          .response({
            user: users,
            meta: {
              api: meta.api,
              msg: `I deleted that user`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default UserRoutes

export { User, UserRoutes }
