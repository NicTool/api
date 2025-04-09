import validate from '@nictool/validate'

import Config from '../lib/config.js'
import Jwt from '@hapi/jwt'

import User from '../lib/user.js'
import Session from '../lib/session.js'

import { meta } from '../lib/util.js'

const httpCfg = await Config.get('http')

function SessionRoutes(server) {
  server.route([
    {
      method: 'GET',
      path: '/session',
      options: {
        response: {
          schema: validate.session.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user, group, session } = h.request.auth.credentials

        Session.put({ id: session.id, last_access: true })

        return h
          .response({
            user: user,
            group: group,
            session: { id: session.id },
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
          failAction: 'log',
        },
        response: {
          schema: validate.session.GET_res,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const account = await User.authenticate(request.payload)
        if (!account) {
          return h.response({ err: 'Invalid authentication' }).code(401)
        }

        const sessId = await Session.create({
          uid: account.user.id,
          session: '3.0.0',
          last_access: parseInt(Date.now() / 1000, 10),
        })

        const token = Jwt.token.generate(
          {
            aud: 'urn:audience:test',
            iss: 'urn:issuer:test',
            nt: {
              user: account.user,
              group: account.group,
              session: { id: sessId },
            },
          },
          {
            key: httpCfg.jwt.key,
            algorithm: 'HS512',
          },
          {
            ttlSec: 28800, // 8 hours
          },
        )

        return h
          .response({
            user: account.user,
            group: account.group,
            session: { id: sessId, token: token },
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
      options: {
        validate: {
          query: validate.session.DELETE,
          failAction: 'log',
        },
        response: {
          schema: validate.session.GET,
          failAction: 'log',
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user, group, session } = h.request.auth.credentials

        const bool = await Session.delete({
          id: session.id,
          session: '3.0.0',
        })

        return h
          .response({
            meta: {
              api: meta.api,
              msg: `You are logged out: ${bool}`,
            },
          })
          .code(200)
      },
    },
  ])
}

export default SessionRoutes

export { Session, SessionRoutes }
