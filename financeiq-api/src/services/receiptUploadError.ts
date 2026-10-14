export class ReceiptUploadError extends Error {
  constructor(public readonly status: 400 | 413 | 415 | 422 | 429 | 503 | 504, public readonly code: string) {
    super(code);
  }
}
