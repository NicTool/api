const storeType = process.env.NICTOOL_DATA_STORE ?? 'mysql'

let RepoClass
switch (storeType) {
  case 'toml':
    RepoClass = (await import('./zoneRepoTOML.js')).default
    break
  case 'mongodb':
    RepoClass = (await import('./zoneRepoMongoDB.js')).default
    break
  case 'elasticsearch':
    RepoClass = (await import('./zoneRepoElasticsearch.js')).default
    break
  default:
    RepoClass = (await import('./zoneRepoMySQL.js')).default
}

export default new RepoClass()
