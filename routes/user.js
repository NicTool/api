const schema = require('@nictool/nt-validate')

const User = require('../lib/user')

module.exports = (server) => {
  server.route([
    {
      method: 'GET',
      path: '/login',
      options: {
        auth: { mode: 'try' },
        plugins: {
          cookie: {
            redirectTo: false,
          },
        },
        handler: async (request, h) => {
          if (request.auth.isAuthenticated) {
            return h.redirect('/')
          }

          return 'You need to log in!'
        },
      },
    },
    {
      method: 'POST',
      path: '/login',
      options: {
        auth: { mode: 'try' },
        handler: async (request, h) => {
          const account = await User.authenticate(request.payload)
          if (!account) return 'Invalid authentication'

          // TODO: generate session

          // console.log(account)

          request.cookieAuth.set({ id: account.nt_user_id })
          return h.redirect('/')
        },
        validate: {
          payload: schema.login,
        },
      },
    },
    {
      method: 'GET',
      path: '/logout',
      options: {
        handler: (request, h) => {
          request.cookieAuth.clear()
          return h.redirect('/')
        },
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
