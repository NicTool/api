import validate from '@nictool/validate'

import User from '../lib/user/index.js'
import { meta } from '../lib/util.js'

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
          deleted: request.query.deleted === true ? 1 : 0,
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
        validate: {
          query: validate.user.GET_req,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const users = await User.get({
          deleted: request.query.deleted ?? 0,
          id: parseInt(request.params.id, 10),
        })

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

        const gid = parseInt(users[0].gid, 10)
        delete users[0].gid

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
        validate: {
          payload: validate.user.POST,
        },
        response: {
          schema: validate.user.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const uid = await User.create(request.payload)
        if (!uid) {
          console.log(`POST /user oops`) // TODO
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
        const args = { ...request.payload, id }

        if (args.password) {
          args.pass_salt = User.generateSalt()
          args.password = await User.hashAuthPbkdf2(args.password, args.pass_salt)
        }

        await User.put(args)

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
        validate: {
          query: validate.user.DELETE,
        },
        response: {
          schema: validate.user.GET_res,
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
