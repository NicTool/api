const mysql = require('./mysql')

const validate = require('@nictool/nt-validate')

class Group {
  constructor() {}

  async create(args) {
    // console.log(`create`)
    const { error } = validate.group.validate(args)
    if (error) console.error(error)

    const g = await this.read({ nt_group_id: args.nt_group_id })
    if (g.length) {
      // console.log(g)
      return g[0].nt_group_id
    }

    const groupId = await mysql.insert(`INSERT INTO nt_group`, args)
    return groupId
  }

  async read(args) {
    return await mysql.select(`SELECT * FROM nt_group WHERE`, args)
  }

  async destroy(args) {
    const g = await this.read({ nt_group_id: args.nt_group_id })
    // console.log(g)
    if (g.length === 1) {
      await mysql.execute(`DELETE FROM nt_group WHERE nt_group_id=?`, [
        g[0].nt_group_id,
      ])
    }
  }
}

module.exports = new Group()
module.exports._mysql = mysql
