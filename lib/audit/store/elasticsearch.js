import AuditBase from './base.js'

class AuditRepoElasticsearch extends AuditBase {
  async insertZoneLog(_detail) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }

  async insertZoneRecordLog(_detail) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }

  async insertGlobalLog(_entry) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }

  async listGlobal(_args) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }

  async listZones(_args) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }

  async listZoneRecords(_args) {
    throw new Error('AuditRepoElasticsearch is not yet implemented')
  }
}

export default AuditRepoElasticsearch
