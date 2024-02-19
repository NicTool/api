'use strict'

const hapi = require('@hapi/hapi')
// const hoek = require('@hapi/hoek')
const path = require('node:path')
const qs = require('qs')
// const validate = require('@nictool/nt-validate')

const util = require('../lib/util')
util.setEnv()
const config = require('../lib/config')
const user = require('../lib/user')
// const session = require('../lib/session')
const UserRoutes = require('./user')

let server

const setup = async () => {
  server = hapi.server({
    port: 3000,
    host: 'localhost',
    query: {
      parser: (query) => qs.parse(query),
    },
    routes: {
      files: {
        relativeTo: path.join(__dirname, 'html'),
      },
    },
  })

  await server.register(require('@hapi/basic'))
  await server.register(require('@hapi/cookie'))
  await server.register(require('@hapi/inert'))
  const sessionCfg = await config.get('session')

  server.auth.strategy('session', 'cookie', {
    cookie: sessionCfg.cookie,

    redirectTo: '/login',

    validate: async (request, session) => {
      // console.log(`validate session: ${session}`)
      const account = await session.read({ nt_user_session: session })

      if (!account) return { isValid: false } // invalid cookie

      return { isValid: true, credentials: account }
    },
  })

  server.auth.default('session')

  server.route({
    method: 'GET',
    path: '/',
    handler: (request) => {
      return `Hello World! ${request?.auth?.credentials?.name}`
    },
    // options: {},
  })

  UserRoutes(server)

  server.route({
    method: '*',
    path: '/{any*}',
    handler: function (request, h) {
      return h.response('404 Error! Page Not Found!').code(404)
    },
  })

  server.events.on('stop', () => {
    user._mysql.disconnect()
  })
}

exports.init = async () => {
  await setup()
  await server.initialize()
  return server
}

exports.start = async () => {
  await setup()
  await server.start()
  console.log(`Server running at: ${server.info.uri}`)
  return server
}

process.on('unhandledRejection', (err) => {
  console.error(err)
  process.exit(1)
})
