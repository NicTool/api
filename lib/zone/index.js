const storeType = process.env.NICTOOL_DATA_STORE ?? 'mysql'

let RepoClass
switch (storeType) {
  case 'toml':
    RepoClass = (await import('./store/toml.js')).default
    break
  case 'mongodb':
    RepoClass = (await import('./store/mongodb.js')).default
    break
  case 'elasticsearch':
    RepoClass = (await import('./store/elasticsearch.js')).default
    break
  default:
    RepoClass = (await import('./store/mysql.js')).default
}

export default new RepoClass()
