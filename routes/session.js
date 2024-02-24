const validate = require('@nictool/validate')

const Group = require('../lib/group')
const User = require('../lib/user')
const Session = require('../lib/session')
const Util = require('../lib/util')

module.exports = (server) => {
  server.route([
    {
      method: 'GET',
      path: '/session',
      options: {
        response: {
          schema: validate.user.sessionOut,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { nt_user_id, nt_user_session_id } = request.state['sid-nictool']
        const users = await User.get({ id: nt_user_id })
        const groups = await Group.get({ nt_group_id: users[0].gid })
        delete users[0].gid
        return h
          .response({
            user: users[0],
            group: groups[0],
            session: { id: nt_user_session_id },
            meta: {
              api: Util.meta.api,
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
          payload: validate.user.sessionPOST,
        },
        response: {
          schema: validate.user.sessionOut,
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
              api: Util.meta.api,
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
              api: Util.meta.api,
              msg: 'You are logged out',
            },
          })
          .code(200)
      },
      options: {
        response: {
          schema: validate.user.sessionOut,
        },
        tags: ['api'],
      },
    },
  ])
}
