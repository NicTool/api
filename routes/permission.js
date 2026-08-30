import validate from '@nictool/validate'

import Authz from '../lib/authz/index.js'
import Permission from '../lib/permission/index.js'
import { meta } from '../lib/util.js'

function PermissionRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/permission/{id}',
      options: {
        app: { permission: { resource: 'permission', action: 'read', idFrom: 'params.id' } },
        validate: {
          query: validate.permission.GET_req,
        },
        response: {
          schema: validate.permission.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const getArgs = {
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        }

        const permission = await Permission.get(getArgs)

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `here's your permission`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/permission',
      options: {
        app: { permission: { resource: 'permission', action: 'create' } },
        validate: {
          payload: validate.permission.POST,
        },
        response: {
          schema: validate.permission.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const userPerm = await Permission.getEffective(request.auth.credentials.user.id)
        const uid = request.payload.user?.id
        if (uid !== undefined && request.payload.group?.id == null) {
          const gid = await Authz.getObjectGroupId('user', uid)
          request.payload.group = { ...request.payload.group, id: gid }
        }
        const currentPerm = uid === undefined ? null : await Permission.getEffective(uid)
        request.payload = Authz.capPermissions(userPerm, request.payload, currentPerm)
        if (uid !== undefined && request.payload.inherit !== true) {
          request.payload = Authz.preserveUnmanagedPermissions(userPerm, request.payload, currentPerm)
        }
        delete request.payload.id
        const pid = await Permission.create(request.payload)

        const permission = await Permission.get({ id: pid })

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `the permission was created`,
            },
          })
          .code(201)
      },
    },
    {
      method: 'PUT',
      path: '/permission/{id}',
      options: {
        app: { permission: { resource: 'permission', action: 'write', idFrom: 'params.id' } },
        validate: {
          payload: validate.permission.POST,
        },
        response: {
          schema: validate.permission.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const id = parseInt(request.params.id, 10)
        const existing = await Permission.get({ id })
        if (!existing) {
          return h.response({ meta: { api: meta.api, msg: `permission not found` } }).code(404)
        }

        const userPerm = await Permission.getEffective(request.auth.credentials.user.id)
        const payload = Authz.capPermissions(userPerm, request.payload, existing)
        if (payload.inherit !== undefined) {
          const uid = existing.user?.id
          if (uid === undefined || uid === null) {
            delete payload.inherit
          } else {
            const gid = await Authz.getObjectGroupId('user', uid)
            const groupPerm = gid === null ? null : await Permission.get({ gid })
            const before = existing.inherit === false ? existing : groupPerm
            const after = payload.inherit ? groupPerm : existing
            if (!Authz.canTransitionPermissions(userPerm, before, after)) {
              delete payload.inherit
            }
          }
        }
        delete payload.id
        delete payload.user
        delete payload.group
        await Permission.put({ ...payload, id })
        const permission = await Permission.get({ id })

        return h
          .response({
            permission,
            meta: { api: meta.api, msg: `permission updated` },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/permission/{id}',
      options: {
        app: { permission: { resource: 'permission', action: 'delete', idFrom: 'params.id' } },
        validate: {
          query: validate.permission.DELETE,
          failAction: 'log',
        },
        response: {
          schema: validate.permission.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const permission = await Permission.get({
          deleted: request.query.deleted === true ? 1 : 0,
          id: parseInt(request.params.id, 10),
        })

        if (!permission) {
          return h
            .response({
              meta: {
                api: meta.api,
                msg: `I couldn't find that permission`,
              },
            })
            .code(404)
        }

        await Permission.delete({
          id: permission.id,
          deleted: 1,
        })

        return h
          .response({
            permission,
            meta: {
              api: meta.api,
              msg: `I deleted that permission`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default PermissionRoutes

export { Permission, PermissionRoutes }
