import Mysql from './mysql.js'
import { mapToDbColumn } from './util.js'

const groupDbMap = { id: 'nt_group_id', parent_gid: 'parent_group_id' }
const boolFields = ['deleted']

class Group {
  constructor() {
    this.mysql = Mysql
  }

  async create(args) {
    if (args.id) {
      const g = await this.get({ id: args.id })
      if (g.length === 1) return g[0].id
    }

    return await Mysql.execute(
      ...Mysql.insert(`nt_group`, mapToDbColumn(args, groupDbMap)),
    )
  }

  async get(args) {
    args = JSON.parse(JSON.stringify(args))
    if (args.deleted === undefined) args.deleted = false

    const rows = await Mysql.execute(
      ...Mysql.select(
        `SELECT nt_group_id AS id
        , parent_group_id AS parent_gid
        , name
        , deleted
      FROM nt_group`,
        mapToDbColumn(args, groupDbMap),
      ),
    )
    for (const row of rows) {
      for (const b of boolFields) {
        row[b] = row[b] === 1
      }
      if (args.deleted === false) delete row.deleted
    }
    return rows
  }

  async put(args) {
    if (!args.id) return false
    const id = args.id
    delete args.id
    const r = await Mysql.execute(
      ...Mysql.update(
        `nt_group`,
        `nt_group_id=${id}`,
        mapToDbColumn(args, groupDbMap),
      ),
    )
    return r.changedRows === 1
  }

  async delete(args) {
    const r = await Mysql.execute(
      ...Mysql.update(`nt_group`, `nt_group_id=${args.id}`, {
        deleted: args.deleted ?? 1,
      }),
    )
    return r.changedRows === 1
  }

  async destroy(args) {
    const r = await Mysql.execute(
      ...Mysql.delete(`nt_group`, { nt_group_id: args.id }),
    )
    return r.affectedRows === 1
  }
}

export default new Group()
