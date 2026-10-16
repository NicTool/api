import { storeType } from '../config.js'
import { withCanonicalZone } from './store/base.js'

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
    throw new Error(`zone: no store implementation for type "${type}"`)
}

// Every backend stores and matches a zone's name lowercase without the
// trailing dot, the form dns-nameserver keys zones by. Rows v2 or an older v3
// wrote may not be in that form, so each store compares the canonical form
// of the stored name too.
class Zone extends RepoClass {
  get(args) {
    return super.get(withCanonicalZone(args))
  }

  count(args) {
    return super.count(withCanonicalZone(args))
  }

  create(args, options) {
    return super.create(withCanonicalZone(args), options)
  }

  put(args) {
    return super.put(withCanonicalZone(args))
  }
}

export default new Zone()
