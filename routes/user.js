const validate = require('@nictool/nt-validate')

const User = require('../lib/user')
const Session = require('../lib/session')

module.exports = (server) => {
  server.route([
    {
      method: 'GET',
      path: '/user',
      options: {
        // auth: { mode: 'try' },
      },
      handler: async (request, h) => {
        // console.log(request.auth)
        if (request.auth.isAuthenticated) {
          return h.response('You ARE logged in!').code(200)
        }

        return h.response('You are NOT logged in!').code(401)
      },
    },
    {
      method: 'POST',
      path: '/session',
      options: {
        auth: { mode: 'try' },
        validate: { payload: validate.login },
      },
      handler: async (request, h) => {
        const account = await User.authenticate(request.payload)
        if (!account) {
          return h.response('Invalid authentication').code(401)
        }

        const sessId = await Session.create({
          nt_user_id: account.nt_user_id,
          nt_user_session: '12345',
        })

        request.cookieAuth.set({
          nt_user_id: account.nt_user_id,
          nt_session_id: sessId.nt_user_session_id,
        })
        return h.response(`SUCCESS: you are logged in`).code(200)
      },
    },
    {
      method: 'DELETE',
      path: '/session',
      handler: (request, h) => {
        if (request.auth.isAuthenticated) {
          request.cookieAuth.clear()
          return h.response('You are logged out').code(200)
        }
        return h.response('You are NOT logged in!').code(401)
      },
    },
  ])
}

/*
  server.route({
    method: 'POST', // GET PUT POST DELETE
    path: '/login',
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
