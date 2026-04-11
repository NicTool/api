import UserBase from './base.js'

class UserRepoElasticsearch extends UserBase {
  async authenticate(_authTry) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }

  async get(_args) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }

  async create(_args) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }

  async put(_args) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }

  async delete(_args) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }

  async destroy(_args) {
    throw new Error('UserRepoElasticsearch is not yet implemented')
  }
}

export default UserRepoElasticsearch
