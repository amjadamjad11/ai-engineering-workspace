# API Specification & Contracts

**Project:** AI Engineering Workspace  
**API Protocol:** REST over HTTPS  
**Content-Type:** `application/json`  
**API Prefix:** `/api/v1`  
**Documentation:** OpenAPI 3.0 / Swagger (available at `/api/docs`)  

---

## 1. Standard Response Envelope

All API endpoints return a predictable JSON envelope structure to ensure consistent consumption by the frontend application.

### 1.1. Success Response Structure
```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta | null;
  error: null;
}

interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}
```

### 1.2. Error Response Structure
```typescript
interface ApiErrorResponse {
  success: false;
  data: null;
  meta: null;
  error: {
    code: string;       // e.g., 'FORBIDDEN_TENANT_ACCESS', 'VALIDATION_ERROR', 'RESOURCE_NOT_FOUND'
    message: string;    // Human-readable summary
    details?: any[];    // Field-level validation issues or context
    timestamp: string;  // ISO 8601 string
    path: string;       // Request URL
  };
}
```

---

## 2. Authentication & Headers

* **Authorization:** `Bearer <SUPABASE_JWT_TOKEN>`
* **Tenant Header:** `x-organization-id: <ORGANIZATION_UUID>` (Required on tenant-scoped operations, or passed as URL path parameter)
* **Correlation ID:** `x-request-id: <UUID>` (Optional client trace identifier; generated automatically if missing)

---

## 3. Endpoints by Domain Module

### 3.1. Authentication & User Profile (`/auth`, `/profile`)

#### `GET /api/v1/profile/me`
* **Description:** Retrieve the authenticated developer's profile and active organization memberships.
* **Auth:** Required (`Bearer`).
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "c1f7b0b2-8501-443b-a2ea-9e797a7a505b",
    "email": "amjad@example.com",
    "fullName": "Amjad Dev",
    "displayName": "Amjad",
    "avatarUrl": "https://cdn.example.com/avatars/amjad.png",
    "status": "ACTIVE",
    "organizations": [
      {
        "organizationId": "550e8400-e29b-41d4-a716-446655440000",
        "organizationName": "Acme Engineering",
        "role": "OWNER"
      }
    ]
  },
  "meta": null,
  "error": null
}
```

#### `PATCH /api/v1/profile/me`
* **Description:** Update developer profile details.
* **Auth:** Required.
* **Body:**
```json
{
  "fullName": "Amjad Senior Dev",
  "displayName": "Amjad",
  "avatarUrl": "https://..."
}
```

---

### 3.2. Organizations & Members (`/organizations`)

#### `POST /api/v1/organizations`
* **Description:** Create a new organization. The creator automatically receives the `OWNER` role.
* **Auth:** Required.
* **Body:**
```json
{
  "name": "Acme AI Labs",
  "slug": "acme-ai-labs"
}
```
* **Response (201 Created):** Returns created organization object.

#### `GET /api/v1/organizations`
* **Description:** List all organizations the authenticated user belongs to.
* **Auth:** Required.

#### `GET /api/v1/organizations/:orgId`
* **Description:** Get organization details and statistics.
* **Auth:** Required. Must be a member of `:orgId`.

#### `POST /api/v1/organizations/:orgId/members/invite`
* **Description:** Invite a new team member with an assigned role.
* **Auth:** Required (`OWNER` or `ADMIN`).
* **Body:**
```json
{
  "email": "developer@acme.com",
  "role": "BACKEND_DEV"
}
```

#### `GET /api/v1/organizations/:orgId/members`
* **Description:** List members of the organization with roles and statuses.
* **Auth:** Required.

---

### 3.3. Projects (`/organizations/:orgId/projects`)

#### `POST /api/v1/organizations/:orgId/projects`
* **Description:** Create a new project within the organization.
* **Auth:** Required.
* **Body:**
```json
{
  "name": "AI SaaS Backend",
  "slug": "ai-saas-backend",
  "description": "Backend API and AI orchestration system"
}
```

#### `GET /api/v1/organizations/:orgId/projects`
* **Description:** List projects in the organization visible to the user.
* **Query Params:** `page=1&limit=20&status=ACTIVE&search=saas`
* **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "organizationId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "AI SaaS Backend",
      "slug": "ai-saas-backend",
      "description": "Backend API and AI orchestration system",
      "status": "ACTIVE",
      "createdAt": "2026-11-04T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false
  },
  "error": null
}
```

#### `GET /api/v1/organizations/:orgId/projects/:projectId`
* **Description:** Retrieve detailed project metadata, member roster, and settings.
* **Auth:** Required (`ProjectAccessGuard`).

---

### 3.4. Tasks & Milestones (`/organizations/:orgId/projects/:projectId/tasks`)

#### `POST /api/v1/organizations/:orgId/projects/:projectId/tasks`
* **Description:** Create a task within a project.
* **Body:**
```json
{
  "title": "Design Database Migrations for Supabase",
  "description": "Define Prisma schema for profiles, projects, tasks, and pgvector embeddings.",
  "status": "TODO",
  "priority": "HIGH",
  "milestoneId": null,
  "assigneeIds": ["c1f7b0b2-8501-443b-a2ea-9e797a7a505b"],
  "estimatedHours": 8.0,
  "dueDate": "2026-11-10"
}
```

#### `GET /api/v1/organizations/:orgId/projects/:projectId/tasks`
* **Description:** Filter and retrieve tasks for board or list views.
* **Query Params:** `status=TODO,IN_PROGRESS&priority=HIGH&assigneeId=...&page=1&limit=50`

#### `PATCH /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId`
* **Description:** Update task status, assignees, or details.
* **Body:**
```json
{
  "status": "IN_PROGRESS"
}
```

#### `POST /api/v1/organizations/:orgId/projects/:projectId/tasks/:taskId/comments`
* **Description:** Post a comment to a task thread.
* **Body:**
```json
{
  "content": "PR opened addressing the schema migrations: https://github.com/..."
}
```

---

### 3.5. Conversations & Messages (`/organizations/:orgId/projects/:projectId/conversations`)

#### `GET /api/v1/organizations/:orgId/projects/:projectId/conversations`
* **Description:** List discussion threads and AI conversation sessions.

#### `POST /api/v1/organizations/:orgId/projects/:projectId/conversations`
* **Description:** Start a new channel or AI session thread.
* **Body:**
```json
{
  "title": "Architecture Review — RAG Pipeline",
  "type": "CHANNEL"
}
```

#### `GET /api/v1/organizations/:orgId/projects/:projectId/conversations/:convoId/messages`
* **Description:** Fetch messages in chronological order.
* **Query Params:** `cursor=<MESSAGE_UUID>&limit=50`

#### `POST /api/v1/organizations/:orgId/projects/:projectId/conversations/:convoId/messages`
* **Description:** Send a message in a conversation.
* **Body:**
```json
{
  "content": "Should we use HNSW or IVFFlat index for the pgvector chunks?"
}
```

---

### 3.6. AI & Knowledge Retrievial (`/organizations/:orgId/projects/:projectId/ai`)

#### `POST /api/v1/organizations/:orgId/projects/:projectId/ai/chat`
* **Description:** Query the AI with permission-checked RAG project memory.
* **Body:**
```json
{
  "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "prompt": "How does our multi-tenant isolation guard work?",
  "provider": "openai",
  "model": "gpt-4o",
  "stream": false
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "runId": "a5e921d1-6e3e-4b72-9112-9c169c9b57ad",
    "reply": "The multi-tenant isolation operates via a dual-layer strategy: NestJS OrgTenantGuard validates membership...",
    "sources": [
      {
        "documentTitle": "Security Architecture Plan",
        "sourceUri": "docs/SECURITY_PLAN.md",
        "snippet": "Layer 3: OrgTenantGuard resolves Organization ID and validates membership...",
        "similarity": 0.89
      }
    ],
    "usage": {
      "promptTokens": 1420,
      "completionTokens": 320,
      "totalTokens": 1740,
      "estimatedCost": 0.0068
    }
  },
  "meta": null,
  "error": null
}
```

#### `POST /api/v1/organizations/:orgId/projects/:projectId/knowledge/ingest`
* **Description:** Upload or index a technical document or architectural record into project memory.
* **Body:**
```json
{
  "title": "API Specification v1",
  "content": "# Full markdown text...",
  "docType": "SPECIFICATION"
}
```

---

### 3.7. Agent Orchestration (`/organizations/:orgId/projects/:projectId/agents`)

#### `GET /api/v1/organizations/:orgId/projects/:projectId/agents`
* **Description:** List available specialized agents (Frontend, Backend, QA, Architecture, etc.).

#### `POST /api/v1/organizations/:orgId/projects/:projectId/agents/:agentId/execute`
* **Description:** Dispatch a high-level task goal to an AI Agent.
* **Body:**
```json
{
  "goal": "Review the proposed task dependency DAG for circular references.",
  "contextTaskId": "..."
}
```

#### `POST /api/v1/organizations/:orgId/projects/:projectId/agents/approvals/:approvalId`
* **Description:** Submit human approval or rejection for a sensitive tool execution proposed by an agent.
* **Body:**
```json
{
  "approved": true,
  "reason": "Verified that migration file does not drop non-empty columns."
}
```

