import { storeType } from '../config.js'

const type = storeType()

let RepoClass
switch (type) {
  case 'json':
  case 'toml':
    RepoClass = (await import('./store/file.js')).default
    break
  case 'mysql':
    RepoClass = (await import('./store/mysql.js')).default
    break
  case 'mongodb':
    RepoClass = (await import('./store/mongodb.js')).default
    break
  case 'elasticsearch':
    RepoClass = (await import('./store/elasticsearch.js')).default
    break
  default:
    throw new Error(`authz: no store implementation for type "${type}"`)
}

export default new RepoClass()
