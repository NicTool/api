'use strict'

import Jwt from '@hapi/jwt'
import Hapi from '@hapi/hapi'
import HapiSwagger from '@msimerson/hapi-openapi'

import Config from '../lib/config.js'
import { StoreConflictError } from '../lib/store/error.js'

import pkgJson from '../package.json' with { type: 'json' }

import GroupRoutes from './group.js'
import { User, UserRoutes } from './user.js'
import { Session, SessionRoutes } from './session.js'
import { maxAgeSec, timeSkewSec } from '../lib/session/v3.js'
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
    routes: {
      cors: true,
      validate: {
        failAction: async (request, h, err) => {
          if (process.env.NODE_ENV === 'production') {
            console.error('ValidationError:', err.message)
            throw err.data.defaultError
          }
          console.error(err)
          throw err
        },
        options: {
          abortEarly: false,
        },
      },
    },
  })

  await server.register(Jwt)
  // registers @hapi/inert itself for the Swagger UI's static files
  await server.register({
    plugin: HapiSwagger,
    options: {
      info: {
        title: 'NicTool API Documentation',
        version: pkgJson.version,
      },
      swagger: '2.0',
      host: httpCfg.host ? `${httpCfg.host}:${httpCfg.port}` : `localhost:${httpCfg.port}`,
      documentationPage: true,
      swaggerUI: true,
      debug: true,
      grouping: 'tags',
    },
  })

  server.auth.strategy('nt_jwt_strategy', 'jwt', {
    keys: httpCfg.jwt.key,
    verify: {
      aud: 'urn:audience:test',
      iss: 'urn:issuer:test',
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec,
      timeSkewSec,
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

  server.ext('onPreResponse', (request, h) => {
    const response = request.response
    if (response?.code === 'STORE_INVALID') {
      return h.response({ statusCode: 400, error: 'Bad Request', message: response.message }).code(400)
    }
    if (!(response instanceof StoreConflictError) && response?.code !== 'STORE_CONFLICT') {
      return h.continue
    }

    return h
      .response({
        statusCode: 409,
        error: 'Conflict',
        message: response.message,
      })
      .code(409)
  })

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
      const err = event.error
      const details = err?.details?.map((d) => `${d.path.join('.')}: ${d.message}`).join(', ')
      console.error(
        `Request ${event.request} error: ${err ? err.message : 'unknown'}${details ? ` [${details}]` : ''} | path=${request.path} query=${JSON.stringify(request.query)} tags=${JSON.stringify(tags)}`,
      )
    }
  })

  server.ext('onPostStop', async () => {
    await User.disconnect()
    await Session.disconnect()
  })
}

async function init() {
  await setup()
  await server.initialize()
  return server
}

async function start() {
  await setup()
  // Fail fast on an unhandled rejection when running as the server. Not
  // installed by tests
  process.on('unhandledRejection', (err) => {
    console.error(err)
    process.exit(1)
  })
  /* c8 ignore next 3 */
  await server.start()
  console.log(`API running at: ${server.info.uri}`)
  return server
}

export { init, start }

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
