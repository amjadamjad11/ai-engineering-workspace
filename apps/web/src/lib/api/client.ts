import { ApiResult, ApiErrorResponse } from "@ai-workspace/shared";

export class ApiError extends Error {
  public code: string;
  public details?: unknown;
  public timestamp?: string;
  public path?: string;

  constructor(errorResponse: ApiErrorResponse["error"]) {
    super(errorResponse.message);
    this.name = "ApiError";
    this.code = errorResponse.code;
    this.details = errorResponse.details;
    this.timestamp = errorResponse.timestamp;
    this.path = errorResponse.path;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Standard typed API client conforming strictly to packages/shared/src/contracts/api-response.contract.ts
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

  const { timeoutMs = 15000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    const result: ApiResult<T> = await response.json().catch(() => {
      throw new Error(`Invalid JSON received from ${url} (HTTP ${response.status})`);
    });

    if (!result.success) {
      throw new ApiError(result.error);
    }

    return result.data;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`API request timed out after ${timeoutMs}ms: ${url}`);
    }
    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new Error(`API Request Error (${url}): ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

