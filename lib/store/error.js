export class StoreConflictError extends Error {
  constructor(entity, id) {
    super(`${entity} id ${id} already exists`)
    this.name = 'StoreConflictError'
    this.code = 'STORE_CONFLICT'
  }
}

// ifExists keeps the old return-the-existing-id behaviour for fixtures, so
// create() is not an accidental upsert everywhere else.
export function idConflict(entity, id, options = {}) {
  if (options.ifExists === 'return') return id
  throw new StoreConflictError(entity, id)
}
