import UserBase from './userBase.js'

class UserRepoMongoDB extends UserBase {
  async authenticate(_authTry) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }

  async get(_args) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }

  async create(_args) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }

  async put(_args) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }

  async delete(_args) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }

  async destroy(_args) {
    throw new Error('UserRepoMongoDB is not yet implemented')
  }
}

export default UserRepoMongoDB
