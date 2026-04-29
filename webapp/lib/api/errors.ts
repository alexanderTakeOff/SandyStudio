// ──────────────────────────────────────────────────────────────────────────────
// lib/api/errors.ts
// Typed API errors. Route handlers throw these; withApiHandler maps to status.
// ──────────────────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'governance_block'
  | 'storage_invalid_path'
  | 'storage_write_failed'
  | 'rate_limited'
  | 'internal';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Director access required') {
    super(403, 'forbidden', message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, 'validation', message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

export class GovernanceBlockError extends ApiError {
  constructor(reason: string) {
    super(409, 'governance_block', reason);
  }
}
