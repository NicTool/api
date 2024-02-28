import validate from '@nictool/validate'

import Group from '../lib/group.js'
import User from '../lib/user.js'
import Session from '../lib/session.js'
import { meta } from '../lib/util.js'

function SessionRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/session',
      options: {
        response: {
          schema: validate.session.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { nt_user_id, nt_user_session_id } = request.state['sid-nictool']
        const users = await User.get({ id: nt_user_id })
        const groups = await Group.get({ id: users[0].gid })
        delete users[0].gid
        return h
          .response({
            user: users[0],
            group: groups[0],
            session: { id: nt_user_session_id },
            meta: {
              api: meta.api,
              msg: `working on it`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'POST',
      path: '/session',
      options: {
        auth: { mode: 'try' },
        validate: {
          payload: validate.session.POST,
        },
        response: {
          schema: validate.session.GET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const account = await User.authenticate(request.payload)
        if (!account) {
          return h.response({ err: 'Invalid authentication' }).code(401)
        }

        const sessId = await Session.create({
          nt_user_id: account.user.id,
          nt_user_session: '3.0.0',
          last_access: parseInt(Date.now() / 1000, 10),
        })

        request.cookieAuth.set({
          nt_user_id: account.user.id,
          nt_user_session_id: sessId,
        })

        return h
          .response({
            user: account.user,
            group: account.group,
            session: { id: sessId },
            meta: {
              api: meta.api,
              msg: `you are logged in`,
            },
          })
          .code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/session',
      handler: (request, h) => {
        request.cookieAuth.clear()

        return h
          .response({
            meta: {
              api: meta.api,
              msg: 'You are logged out',
            },
          })
          .code(200)
      },
      options: {
        response: {
          schema: validate.session.GET,
        },
        tags: ['api'],
      },
    },
  ])
}

export default SessionRoutes

export { Session, SessionRoutes }
