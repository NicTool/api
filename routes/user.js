import validate from '@nictool/validate'

import User from '../lib/user/index.js'
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

function UserRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/user',
      options: {
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
        }

        const users = await User.get(getArgs)
        for (const u of users) delete u.gid

        return h
          .response({
            user: users,
            meta: {
              api: meta.api,
              msg: `users in group`,
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
          failAction: 'log',
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

        const uid = getArgs.id
        const gid = parseInt(users[0].gid, 10)
        delete users[0].gid

        const perm = await Permission.getEffective(uid)
        const groupPerm = await Permission.getGroup({
          uid, deleted: false,
        })
        if (perm && groupPerm) {
          perm.nameserver.usable = groupPerm.nameserver?.usable ?? []
        }

        return h
          .response({
            user: users,
            group: { id: gid },
            permissions: perm ?? {},
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
          options: { allowUnknown: true },
        },
        response: {
          schema: validate.user.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user } = request.auth.credentials
        const userPerm = await Permission.getEffective(user.id)
        request.payload = Authz.capPermissions(userPerm, request.payload)

        const permFields = extractPermFields(request.payload)
        const uid = await User.create(request.payload)

        if (Object.keys(permFields).length > 0) {
          const perm = await Permission.get({ uid })
          if (perm) await Permission.put({ id: perm.id, ...permFields })
        }

        const users = await User.get({ id: uid })
        const group = { id: users[0].gid }
        delete users[0].gid

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
        app: { permission: { resource: 'user', action: 'write', idFrom: 'params.id' } },
        validate: {
          payload: validate.user.PUT,
          options: { allowUnknown: true },
        },
        response: {
          schema: validate.user.GET_res,
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

        const args = { ...request.payload, id }

        if (args.password) {
          args.pass_salt = User.generateSalt()
          args.password = await User.hashAuthPbkdf2(args.password, args.pass_salt)
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
          return h
            .response({ meta: { api: meta.api, msg: `user not found` } })
            .code(404)
        }
        delete users[0].gid

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
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const users = await User.get(request.params)
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

        delete users[0].gid

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
