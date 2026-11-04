# Frontend API Integration & Client Architecture

## 1. Architecture Philosophy
- We interact with Amjad's NestJS backend (`apps/api`) strictly via the standard envelope defined in `packages/shared/src/contracts/api-response.contract.ts`:
  ```typescript
  export interface ApiResponse<T> {
    success: true;
    data: T;
    meta: ApiMeta | null;
    error: null;
  }
  ```
- All client-side requests use a centralized, typed API client wrapper (`src/lib/api/client.ts`).
- Streaming endpoints (such as `POST /api/v1/ai/chat`) consume Server-Sent Events (SSE) via the standard `fetch` ReadableStream reader with custom chunk decoders.

---

## 2. API Client Wrapper Specification (`src/lib/api/client.ts`)

```typescript
import { ApiResponse, ApiErrorResponse, ApiResult } from '@ai-workspace/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const payload: ApiResult<T> = await response.json();

  if (!payload.success) {
    throw new Error(payload.error.message || 'API Request Failed');
  }

  return payload.data;
}
```

---

## 3. Mock Adapter Strategy (During Backend Development)
If Amjad is currently implementing a specific backend endpoint:
1. We define a typed Mock Adapter interface mirroring `@ai-workspace/shared`.
2. Mock data returns through the exact `ApiResponse<T>` envelope with realistic artificial latency (150ms).
3. When Amjad's NestJS endpoint is ready, flipping an environment variable (`NEXT_PUBLIC_USE_MOCKS=false`) points the client to the live API with zero component modifications.

