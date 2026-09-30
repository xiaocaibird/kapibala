export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
}
export class RemoteError extends Error {
  constructor(readonly status: number, readonly code: string, readonly body: Record<string, unknown> = {}) { super(code); }
}
