'use strict'

import path from 'node:path'
import url from 'node:url'

import Hapi from '@hapi/hapi'
import Cookie from '@hapi/cookie'
import Inert from '@hapi/inert'
import Vision from '@hapi/vision'
import HapiSwagger from 'hapi-swagger'
// import Hoek from '@hapi/hoek'

import qs from 'qs'

import Config from '../lib/config.js'

import pkgJson from '../package.json' with { type: 'json' }

import GroupRoutes from './group.js'
import { User, UserRoutes } from './user.js'
import { Session, SessionRoutes } from './session.js'

let server

async function setup() {
  const httpCfg = await Config.get('http')

  server = Hapi.server({
    port: httpCfg.port,
    host: httpCfg.host,
    query: {
      parser: (query) => qs.parse(query),
    },
    routes: {
      files: {
        relativeTo: path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'html'),
      },
    },
  })

  await server.register(Cookie)
  await server.register(Inert)
  await server.register([
    Inert,
    Vision,
    {
      plugin: HapiSwagger,
      options: {
        info: {
          title: 'NicTool API Documentation',
          version: pkgJson.version,
        },
      },
    },
  ])

  const sessionCfg = await Config.get('session')

  server.auth.strategy('session', 'cookie', {
    cookie: sessionCfg.cookie,

    validate: async (request, session) => {
      const s = await Session.get({ id: session.nt_user_session_id })
      if (!s) return { isValid: false } // invalid cookie

      // const account = await User.get({ id: s.nt_user_id })
      return { isValid: true } // , credentials: account }
    },
  })

  server.auth.default('session')

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      return h.response({ joy: true }).code(200)
    },
  })

  GroupRoutes(server)
  UserRoutes(server)
  SessionRoutes(server)

  server.route({
    method: '*',
    path: '/{any*}',
    handler: function (request, h) {
      return h.response({ msg: '404 Error! Page Not Found!' }).code(404)
    },
  })

  server.events.on('stop', () => {
    if (User.mysql) User.mysql.disconnect()
    if (Session.mysql) Session.mysql.disconnect()
  })
}

async function init() {
  await setup()
  await server.initialize()
  return server
}

async function start() {
  await setup()
  await server.start()
  console.log(`Server running at: ${server.info.uri}`)
  return server
}

export {
  init,
  start,
}

process.on('unhandledRejection', (err) => {
  console.error(err)
  process.exit(1)
})

/*
  server.route({
    method: 'POST', // GET PUT POST DELETE
    path: '/',
    handler: (request, h) => {
      // request.query
      // request.params
      // request.payload
      // console.log(request.payload)
      return 'Hello Login World!'
    },
    options: {
      auth: { mode: 'try' },
      // plugins: {
      //   cookie: {
      //     redirectTo: false,
      //   }
      // },
      // response: {},
      validate: {
        // headers: true,
        // query: true,
        params: validate.login,
        // payload: true,
        // state: true,
      },
    },
  }),
*/
