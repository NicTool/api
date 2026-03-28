const storeType = process.env.NICTOOL_DATA_STORE ?? 'mysql'

let RepoClass
switch (storeType) {
  case 'toml':
    RepoClass = (await import('./toml.js')).default
    break
  default:
    RepoClass = (await import('./mysql.js')).default
}

export default new RepoClass()
