/** Shared error with a stable machine-readable code. */
export class AtlasError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AtlasError';
    this.code = code;
    this.details = details;
  }
}

export function isAtlasError(error) {
  return error instanceof AtlasError || (error && typeof error === 'object' && typeof error.code === 'string' && error.name === 'AtlasError');
}
