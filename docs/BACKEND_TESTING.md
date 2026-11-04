# Backend Testing Strategy & Quality Assurance

**Project:** AI Engineering Workspace  
**Lead Engineer:** Amjad (Backend Lead)  
**Standard:** Zero Silent Failures, Mandatory Tenant Verification  

---

## 1. Testing Philosophy

The AI Engineering Workspace backend handles sensitive source code discussions, engineering specifications, proprietary vector embeddings, and billing quotas. Therefore, tests are not an afterthought; they are the primary contract verification mechanism.

### Non-Negotiable Rules
1. **Never Report Untested Code:** Never declare a feature or phase complete without running the corresponding automated test suites.
2. **Dedicated Test Database:** Tests run against an isolated PostgreSQL instance (or dedicated Supabase test schema), never production or staging data.
3. **Cross-Tenant Attack Tests:** Every new endpoint must have a dedicated test attempting cross-organization and cross-project access to prove rejection (`403 Forbidden` / `404 Not Found`).

---

## 2. Test Pyramid & Scope

```
            / \
           /   \
          / E2E \       <-- Critical API flows & Tenant Breach Tests (~15%)
         /-------\
        /  Integ. \     <-- Database, Prisma, Supabase Auth, Webhooks (~35%)
       /-----------\
      /    Unit     \   <-- Business logic, DTOs, Adapters, AI Parsers (~50%)
     /---------------\
```

### 2.1. Unit Tests (`*.spec.ts`)
* **Focus:** Pure logic isolated from external networks and databases.
* **Targets:**
  * Provider-independent AI Adapters (mocking network payloads, verifying token counts).
  * Prompt templates and chunking utilities.
  * DTO validation rules (Zod / class-validator).
  * Rate limiter algorithms and cost calculators.

### 2.2. Integration Tests (`*.integration.spec.ts`)
* **Focus:** Component interaction with PostgreSQL, Prisma ORM, and Supabase Auth.
* **Targets:**
  * Prisma transactions and cascade behaviors.
  * `pgvector` cosine distance queries and index performance.
  * GitHub webhook signature verification (HMAC SHA-256).
  * Guard execution pipeline (`JwtAuthGuard` -> `OrgTenantGuard` -> `ProjectAccessGuard`).

### 2.3. End-to-End (E2E) Security Tests (`test/e2e/`)
* **Focus:** Complete HTTP request-response flows simulating real frontend client calls.
* **Mandatory Security Matrix:**

| Test Case | Scenario | Expected Outcome |
| :--- | :--- | :--- |
| `TC-SEC-01` | User A attempts to list projects from Organization B | `403 Forbidden` / `404 Not Found` |
| `TC-SEC-02` | User A queries task in Project B by guessing UUID | `404 Not Found` |
| `TC-SEC-03` | RAG vector search with query semantically matching Org B's doc | 0 matches returned from Org B |
| `TC-SEC-04` | AI Agent requests tool execution without human approval | Execution suspended, `ai_approvals` entry created |
| `TC-SEC-05` | GitHub webhook sent with forged HMAC signature | `401 Unauthorized` |
| `TC-SEC-06` | Developer invited with `VIEWER` role attempts to delete a task | `403 Forbidden` |

---

## 3. Test Tooling & Scripts

* **Test Runner:** Jest / Vitest
* **HTTP Assertions:** Supertest
* **Database Mocking / Seed:** Prisma test client with transactional rollback or test container migrations.

```bash
# Run unit tests
npm run test

# Run integration tests against test database
npm run test:integration

# Run e2e security and API contract tests
npm run test:e2e

# Run test coverage report
npm run test:cov
```

