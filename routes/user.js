import validate from '@nictool/validate'

import User from '../lib/user.js'
import { meta } from '../lib/util.js'

function UserRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/user',
      options: {
        response: {
          schema: validate.user.GET,
        },
        // tags: ['api'],
      },
      handler: async (request, h) => {
        // get myself
        const { nt_user_id } = request.state['sid-nictool']
        const users = await User.get({ id: nt_user_id })

        delete users[0].gid
        return h
          .response({
            user: users[0],
            meta: {
              api: meta.api,
              msg: `this is you`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'GET',
      path: '/user/{id}',
      options: {
        response: {
          schema: validate.user.GET,
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
            user: users[0],
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
          payload: validate.user.userPOST,
        },
        response: {
          schema: validate.user.GET,
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
            user: users[0],
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
      method: 'DELETE',
      path: '/user/{id}',
      options: {
        response: {
          schema: validate.user.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const users = await User.get(request.params)
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

        const action = request.query.destroy === 'true' ? 'destroy' : 'delete'
        await User[action]({ id: users[0].id })

        delete users[0].gid

        return h
          .response({
            user: users[0],
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

export {
  User,
  UserRoutes,
}