# Multi-Tenant Security & Authorization Architecture

**Project:** AI Engineering Workspace  
**Security Lead:** Amjad (Backend Lead Engineer)  
**Classification:** Critical Platform Infrastructure  

---

## 1. Multi-Tenancy Architecture

AI Engineering Workspace is an enterprise-grade multi-tenant platform where multiple client organizations, internal engineering departments, and independent development teams share the same physical infrastructure.

```
+-------------------------------------------------------------------------------+
|                             CLIENT REQUEST (HTTP/WS)                          |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 1: NETWORK & PERIMETER                                                  |
| - CORS Whitelisting                                                           |
| - Helmet Security Headers                                                      |
| - Rate Limiting (IP + Tenant Bucket Throttling)                               |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 2: AUTHENTICATION (JwtAuthGuard)                                        |
| - Supabase Auth JWT Verification                                              |
| - Extract User ID (`sub`) & Profile Resolution                                |
| - Reject invalid / expired / revoked tokens                                  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 3: TENANT CONTEXT RESOLUTION (OrgTenantGuard)                           |
| - Resolve Organization ID from Route Param / Header / Token Context           |
| - Validate User Active Membership in Organization                             |
| - Inject Tenant Context into Execution Context / AsyncLocalStorage            |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 4: PROJECT & RESOURCE ACCESS (ProjectAccessGuard)                       |
| - Verify Project belongs strictly to verified Organization                    |
| - Check User has Project Member Assignment or Org Admin Privilege             |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 5: RBAC & PERMISSION CHECK (RolesGuard & PermissionsGuard)              |
| - Check required permission code (e.g. `tasks:update`, `ai:execute`)          |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 6: APPLICATION SERVICE / REPOSITORY SCOPING                             |
| - ALL Database queries enforce explicit WHERE organization_id = :orgId        |
| - Vector searches enforce WHERE organization_id = :orgId AND project_id = ... |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| LAYER 7: DATABASE ROW-LEVEL SECURITY (RLS)                                    |
| - Defense-in-depth enforcement for direct DB sessions                         |
+-------------------------------------------------------------------------------+
```

---

## 2. The Supabase "Service-Role Key" Distinction

> [!WARNING]
> **CRITICAL SECURITY DIRECTIVE:**  
> When the NestJS backend interacts with Supabase using the `SUPABASE_SERVICE_ROLE_KEY`, **PostgreSQL Row-Level Security (RLS) policies are completely bypassed**.

### The Danger
Relying solely on database RLS while running backend services with elevated privileges causes catastrophic tenant leakage if an API handler trusts client-supplied IDs without validation.

### Our Mandatory Backend Rule
1. **Never trust client-supplied IDs:** Never accept `organization_id`, `project_id`, or `user_id` from request parameters or bodies without verifying that the authenticated user genuinely has rights to that entity.
2. **Explicit Query Scoping:** Every Prisma query executed by our services must include explicit tenant constraints:
   ```typescript
   // CORRECT:
   const task = await this.prisma.task.findFirst({
     where: {
       id: taskId,
       project: {
         id: projectId,
         organizationId: authenticatedOrgId, // STRICT TENANT ENFORCEMENT
       },
     },
   });
   
   // REJECTED (INSECURE):
   const task = await this.prisma.task.findUnique({
     where: { id: taskId }, // VULNERABLE: Anyone guessing a UUID can access!
   });
   ```

---

## 3. NestJS Guard Hierarchy & Context Propagation

We implement a clean pipeline of guards executed in deterministic order:

### 3.1. `JwtAuthGuard`
* Verifies Supabase Bearer token signature using public keys / JWT secret.
* Attaches verified payload (`user_id`, `email`) to `req.user`.

### 3.2. `OrgTenantGuard`
* Inspects route parameter `:orgId` or header `x-organization-id`.
* Queries `organization_members` for `(organization_id, user_id, status = 'ACTIVE')`.
* If not found, throws `403 Forbidden` (`FORBIDDEN_TENANT_ACCESS`).
* Injects verified `tenant` metadata onto `req.tenantContext`.

### 3.3. `ProjectAccessGuard`
* For project-specific routes (`/organizations/:orgId/projects/:projectId/...`), confirms:
  1. Project exists and belongs to `:orgId`.
  2. Authenticated user has an entry in `project_members` OR holds `OWNER` / `ADMIN` role in `organization_members`.
* If check fails, throws `404 Not Found` (to avoid leaking project existence) or `403 Forbidden`.

### 3.4. `PermissionsGuard`
* Uses NestJS metadata decorator `@RequirePermissions(Permission.TASK_DELETE)`.
* Verifies role permissions associated with user's role in the organization.

---

## 4. Cross-Tenant Data Leakage Prevention in AI & RAG

AI vector retrieval introduces unique cross-tenant data risks. If an embedding query performs an unrestricted nearest-neighbor vector search, an organization's proprietary architectural decisions could be retrieved into another organization's prompt context.

### Mandatory RAG Retrieval Safeguards
1. **Mandatory Metadata Filtering:** Every vector cosine similarity query executed via `pgvector` must include explicit SQL `WHERE` clauses filtering by `organization_id` and `project_id`.
   ```sql
   SELECT id, content, metadata, 1 - (embedding <=> $1) AS similarity
   FROM knowledge_chunks
   WHERE organization_id = $2
     AND project_id = $3
     AND (metadata->>'status' = 'APPROVED' OR metadata->>'visibility' = 'PUBLIC')
   ORDER BY embedding <=> $1
   LIMIT 10;
   ```
2. **Post-Retrieval Verification:** The RAG retrieval pipeline validates that every retrieved chunk's `organization_id` strictly matches the requesting user's tenant before passing text into LLM system prompts.

---

## 5. Secret Management & Credential Hygiene

1. **Zero Secret Exposure:**
   * Never output API keys, DB connection strings, or service tokens in error stacks, logs, or HTTP responses.
   * Supabase Service Key, OpenAI API Key, Anthropic API Key, and GitHub App private keys reside exclusively in environment variables or cloud secret managers.
2. **DTO Sanitization:**
   * Outgoing response DTOs use class-transformer with `@Exclude()` or explicit mapping interfaces. Password hashes, tokens, and internal metadata are stripped before sending.
3. **Webhook Verification:**
   * Incoming GitHub webhooks are verified using HMAC SHA-256 signatures (`X-Hub-Signature-256`) against our stored webhook secret before any event processing begins.

---

## 6. Audit Logging & Non-Repudiation

High-privilege operations generate an immutable record in `audit_logs`:
* Member invitations and removals.
* Role and permission reassignments.
* Project or document deletions.
* AI autonomous agent tool approvals or rejections.
* Changes to repository access or integrations.

