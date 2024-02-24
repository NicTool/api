const Mysql = require('./mysql')
const Util = require('./util')

const validate = require('@nictool/validate')

class Group {
  constructor() {}

  async create(args) {
    const { error } = validate.group.v2.validate(args)
    if (error) console.error(error)

    const g = await this.get({ nt_group_id: args.nt_group_id })
    if (g.length) {
      // console.log(g)
      return g[0].nt_group_id
    }

    const groupId = await Mysql.insert(`INSERT INTO nt_group`, args)
    return groupId
  }

  async get(args) {
    args = Util.mapToDbColumn(args, { id: 'nt_group_id' })
    return await Mysql.select(
      `SELECT nt_group_id AS id, name FROM nt_group WHERE`,
      args,
    )
  }

  async getAdmin(args) {
    return await Mysql.select(
      `SELECT nt_group_id AS id
      , name
      , parent_group_id AS parent_gid
      , deleted
      FROM nt_group WHERE`,
      Util.mapToDbColumn(args, { id: 'nt_group_id' }),
    )
  }

  async destroy(args) {
    const g = await this.getAdmin({ nt_group_id: args.nt_group_id })
    if (g.length === 1) {
      await Mysql.execute(`DELETE FROM nt_group WHERE nt_group_id=?`, [g[0].id])
    }
  }
}

module.exports = new Group()
module.exports._mysql = Mysql
