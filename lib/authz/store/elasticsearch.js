import AuthzBase from './base.js'

class AuthzRepoElasticsearch extends AuthzBase {
  async getObjectGroupId(_resource, _objectId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async isInGroupTree(_userGroupId, _targetGroupId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async isActiveGroup(_groupId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async isActiveObject(_resource, _objectId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async getDirectDelegateAccess(_groupId, _objectId, _resource) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async getDelegatedZoneIds(_groupIds) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async delegatedRecordIdsInZone(_groupId, _zoneId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async zoneDelegationForRecord(_groupId, _zoneRecordId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async liveSessionGroup(_userId, _sessionId, _oldestSec) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }

  async permissionRecord(_permissionId) {
    throw new Error('AuthzRepoElasticsearch is not yet implemented')
  }
}

export default AuthzRepoElasticsearch
