/**
 * Standard API Response Envelope Contracts
 * AI Engineering Workspace
 */

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta | null;
  error: null;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  timestamp: string;
  path: string;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  meta: null;
  error: ApiErrorPayload;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

export enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  FORBIDDEN_TENANT_ACCESS = 'FORBIDDEN_TENANT_ACCESS',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

