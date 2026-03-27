const storeType = process.env.NICTOOL_DATA_STORE ?? 'mysql'

let RepoClass
switch (storeType) {
  case 'toml':
    RepoClass = (await import('./userRepoTOML.js')).default
    break
  case 'mongodb':
    RepoClass = (await import('./userRepoMongoDB.js')).default
    break
  case 'elasticsearch':
    RepoClass = (await import('./userRepoElasticsearch.js')).default
    break
  default:
    RepoClass = (await import('./userRepoMySQL.js')).default
}

export default new RepoClass()
