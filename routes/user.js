const validate = require('@nictool/validate')

const User = require('../lib/user')
const Util = require('../lib/util')

module.exports = (server) => {
  server.route([
    {
      method: 'GET',
      path: '/user',
      options: {
        response: {
          schema: validate.user.userGET,
        },
        tags: ['api'],
      },
      handler: async (request, h) => {
        const { nt_user_id } = request.state['sid-nictool']
        const users = await User.get({ id: nt_user_id })
        delete users[0].gid
        return h
          .response({
            user: users[0],
            meta: {
              api: Util.meta.api,
              msg: `here's your user`,
            },
          })
          .code(200)
      },
    },
  ])
}

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
