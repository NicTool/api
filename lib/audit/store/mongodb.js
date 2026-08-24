import AuditBase from './base.js'

class AuditRepoMongoDB extends AuditBase {
  async insertZoneLog(_detail) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }

  async insertZoneRecordLog(_detail) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }

  async insertGlobalLog(_entry) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }

  async listGlobal(_args) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }

  async listZones(_args) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }

  async listZoneRecords(_args) {
    throw new Error('AuditRepoMongoDB is not yet implemented')
  }
}

export default AuditRepoMongoDB
