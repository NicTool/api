import DelegationBase from './base.js'

class DelegationRepoElasticsearch extends DelegationBase {
  async create(_args) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }

  async getDelegated(_gid, _type) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }

  async getDelegates(_oid, _type, _gid) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }

  async put(_args) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }

  async delete(_args) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }

  async writeLog(_data, _action) {
    throw new Error('DelegationRepoElasticsearch is not yet implemented')
  }
}

export default DelegationRepoElasticsearch
