import validate from '@nictool/validate'

import Config from '../lib/config.js'
import Jwt from '@hapi/jwt'

import User from '../lib/user/index.js'
import Session from '../lib/session/index.js'
import { maxAgeSec, newSessionValue, timeSkewSec } from '../lib/session/v3.js'

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
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user, group, session } = h.request.auth.credentials

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
        },
        response: {
          schema: validate.session.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const account = await User.authenticate(request.payload)
        if (!account) {
          return h.response({ err: 'Invalid authentication' }).code(401)
        }

        const now = parseInt(Date.now() / 1000, 10)
        await Session.expire({ uid: account.user.id, before: now - maxAgeSec - timeSkewSec }).catch((err) => {
          console.error(`session expiry for user ${account.user.id}: ${err.message}`)
        })
        const sessId = await Session.create({
          uid: account.user.id,
          session: newSessionValue(),
          last_access: now,
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
            ttlSec: maxAgeSec,
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
        },
        response: {
          schema: validate.session.GET_res,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { user, group, session } = h.request.auth.credentials

        const bool = await Session.delete({ id: session.id, uid: user.id })

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
