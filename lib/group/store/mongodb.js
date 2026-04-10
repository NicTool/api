import GroupBase from './base.js'

class GroupRepoMongoDB extends GroupBase {
  async authenticate(_authTry) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }

  async get(_args) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }

  async create(_args) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }

  async put(_args) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }

  async delete(_args) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }

  async destroy(_args) {
    throw new Error('GroupRepoMongoDB is not yet implemented')
  }
}

export default GroupRepoMongoDB
