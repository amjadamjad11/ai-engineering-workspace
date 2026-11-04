import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, ApiError } from "./client";
import { ApiResponse, ApiErrorResponse, ApiErrorCode } from "@ai-workspace/shared";

describe("apiClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns unwrapped data on successful ApiResponse<T>", async () => {
    const mockSuccess: ApiResponse<{ status: string }> = {
      success: true,
      data: { status: "ok" },
      meta: null,
      error: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => mockSuccess,
    });

    const data = await apiClient<{ status: string }>("health");
    expect(data).toEqual({ status: "ok" });
  });

  it("throws ApiError when response contains an error envelope", async () => {
    const mockError: ApiErrorResponse = {
      success: false,
      data: null,
      meta: null,
      error: {
        code: ApiErrorCode.UNAUTHORIZED,
        message: "Invalid session token",
        timestamp: "2026-11-04T10:00:00Z",
        path: "/api/v1/health",
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      status: 401,
      json: async () => mockError,
    });

    await expect(apiClient("health")).rejects.toThrow(ApiError);
  });
});

