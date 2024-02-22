'use strict'

const path = require('node:path')

const hapi = require('@hapi/hapi')
const qs = require('qs')
// const hoek = require('@hapi/hoek')
// const validate = require('@nictool/nt-validate')

const util = require('../lib/util')
util.setEnv()
const Config = require('../lib/config')
const Session = require('../lib/session')
const User = require('../lib/user')
const UserRoutes = require('./user')

let server

const setup = async () => {
  const httpCfg = await Config.get('http')

  server = hapi.server({
    port: httpCfg.port,
    host: httpCfg.host,
    query: {
      parser: (query) => qs.parse(query),
    },
    routes: {
      files: {
        relativeTo: path.join(__dirname, 'html'),
      },
    },
  })

  await server.register(require('@hapi/cookie'))
  await server.register(require('@hapi/inert'))
  const sessionCfg = await Config.get('session')

  server.auth.strategy('session', 'cookie', {
    cookie: sessionCfg.cookie,

    validate: async (request, session) => {
      const s = await Session.get({ nt_user_session_id: session.session_id })
      if (!s) return { isValid: false } // invalid cookie

      // const account = await User.get({ nt_user_id: s.nt_user_id })
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

  UserRoutes(server)

  server.route({
    method: '*',
    path: '/{any*}',
    handler: function (request, h) {
      return h.response({ msg: '404 Error! Page Not Found!' }).code(404)
    },
  })

  server.events.on('stop', () => {
    User._mysql.disconnect()
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
