'use strict'

import path from 'node:path'
import url from 'node:url'

import Jwt from '@hapi/jwt'
import Hapi from '@hapi/hapi'
// import Cookie from '@hapi/cookie'
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
import { PermissionRoutes } from './permission.js'
import { NameserverRoutes } from './nameserver.js'
import { ZoneRoutes } from './zone.js'
import { ZoneRecordRoutes } from './zone_record.js'

let server

async function setup() {
  const httpCfg = await Config.get('http')

  server = Hapi.server({
    port: httpCfg.port,
    host: httpCfg.host,
    tls: httpCfg.tls,
    query: {
      parser: (query) => qs.parse(query),
    },
    routes: {
      cors: true,
      files: {
        relativeTo: path.join(
          path.dirname(url.fileURLToPath(import.meta.url)),
          'html',
        ),
      },
    },
  })

  await server.register(Jwt)
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

  server.auth.strategy('nt_jwt_strategy', 'jwt', {
    keys: httpCfg.jwt.key,
    verify: {
      aud: 'urn:audience:test',
      iss: 'urn:issuer:test',
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec: 14400, // 4 hours
      timeSkewSec: 15,
    },
    httpAuthScheme: 'Bearer',
    headerName: 'authorization',
    validate: (artifacts, request, h) => {
      return {
        isValid: true,
        credentials: artifacts.decoded.payload.nt,
      }
    },
  })

  server.auth.default('nt_jwt_strategy')

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
  PermissionRoutes(server)
  NameserverRoutes(server)
  ZoneRoutes(server)
  ZoneRecordRoutes(server)

  server.route({
    method: '*',
    path: '/{any*}',
    handler: function (request, h) {
      return h.response({ msg: '404 Error! Page Not Found!' }).code(404)
    },
  })

  server.events.on('request', (request, event, tags) => {
    if (tags.error) {
      console.error(
        `Request ${event.request} error: ${event.error ? event.error.message : 'unknown'}`,
      )
    }
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
  /* c8 ignore next 3 */
  await server.start()
  console.log(`Server running at: ${server.info.uri}`)
  return server
}

export { init, start }

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
