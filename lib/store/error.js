export class StoreConflictError extends Error {
  constructor(entity, id, message = `${entity} id ${id} already exists`) {
    super(message)
    this.name = 'StoreConflictError'
    this.code = 'STORE_CONFLICT'
  }
}

export class StoreInvalidError extends Error {
  constructor(message) {
    super(message)
    this.name = 'StoreInvalidError'
    this.code = 'STORE_INVALID'
  }
}

// ifExists keeps the old return-the-existing-id behaviour for fixtures, so
// create() is not an accidental upsert everywhere else.
export function idConflict(entity, id, options = {}) {
  if (options.ifExists === 'return') return id
  throw new StoreConflictError(entity, id)
}
