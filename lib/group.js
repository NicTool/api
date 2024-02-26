const Mysql = require('./mysql')
const Util = require('./util')

const groupDbMap = { id: 'nt_group_id', parent_gid: 'parent_group_id' }

class Group {
  constructor() {}

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length) return g[0].id
    }

    return await Mysql.insert(
      `INSERT INTO nt_group`,
      Util.mapToDbColumn(args, groupDbMap),
    )
  }

  async get(args) {
    return await Mysql.select(
      `SELECT nt_group_id AS id
        , parent_group_id AS parent_gid
        , name
      FROM nt_group WHERE`,
      Util.mapToDbColumn(args, groupDbMap),
    )
  }

  async getAdmin(args) {
    return await Mysql.select(
      `SELECT nt_group_id AS id
      , name
      , parent_group_id AS parent_gid
      , deleted
      FROM nt_group WHERE`,
      Util.mapToDbColumn(args, groupDbMap),
    )
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    // Mysql.debug(1)
    const r = await Mysql.update(
      `UPDATE nt_group SET`,
      `WHERE nt_group_id=${id}`,
      Util.mapToDbColumn(args, groupDbMap),
    )
    // console.log(r)
    return r.changedRows === 1
  }

  async delete(args, val) {
    const g = await this.getAdmin(args)
    if (g.length !== 1) return false
    await Mysql.execute(`UPDATE nt_group SET deleted=? WHERE nt_group_id=?`, [
      val ?? 1,
      g[0].id,
    ])
    return true
  }

  async destroy(args) {
    const g = await this.getAdmin(args)
    if (g.length === 1) {
      await Mysql.execute(`DELETE FROM nt_group WHERE nt_group_id=?`, [g[0].id])
    }
  }
}

module.exports = new Group()
module.exports._mysql = Mysql
