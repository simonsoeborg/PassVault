// One error vocabulary for every import format, so the UI can tell a wrong
// password from a damaged file from a format we refuse on purpose.

export type ImportErrorCode = 'WRONG_PASSWORD' | 'UNSUPPORTED' | 'CORRUPT' | 'NOT_A_DATABASE'

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ImportError'
  }
}
