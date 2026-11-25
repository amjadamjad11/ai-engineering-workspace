# @ai-workspace/api — Backend Application

**Domain:** Core Backend Modular Monolith  
**Framework:** NestJS 10.x  
**ORM:** Prisma 6.x  
**Database:** PostgreSQL 16+ (Supabase)  
**Language:** TypeScript  
**Owner:** Backend Lead (Amjad)  
**Package Namespace:** `@ai-workspace/api`  

---

## 1. Overview

This directory contains the core backend API for the AI Engineering Workspace platform. It provides REST APIs, WebSocket real-time collaboration channels, AI provider integrations, permission-aware RAG vector search, and Model Context Protocol (MCP) server endpoints.

---

## 2. Directory Structure

```
apps/api/
├── prisma/
│   ├── schema.prisma                             # Definitive Prisma 6 relational schema
│   └── custom-migration-sql.md                   # Raw SQL triggers & constraints appended to initial migration
├── src/
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts         # Global exception filter (ApiErrorResponse envelope)
│   │   └── interceptors/
│   │       └── transform-response.interceptor.ts # Global response transformer (ApiResponse envelope)
│   ├── config/
│   │   ├── env.config.ts                         # Zod-validated environment schema
│   │   └── swagger.config.ts                     # OpenAPI / Swagger configuration
│   ├── database/
│   │   ├── prisma.service.ts                     # PrismaClient wrapper with NestJS lifecycle hooks
│   │   └── prisma.module.ts                      # Global NestJS module exporting PrismaService
│   ├── dto/
│   │   └── ping.dto.ts                           # Sample validated DTO
│   ├── app.controller.ts                         # Root controller (/api/v1/health & /ping)
│   ├── app.module.ts                             # Root NestJS application module
│   ├── app.service.ts                            # Service providing health status & ping echo
│   └── main.ts                                   # Application bootstrap & global pipeline setup
├── .env.example                                  # Documented environment variables template
├── nest-cli.json                                 # NestJS CLI build and schematic configuration
├── package.json                                  # Backend scripts & dependencies
├── tsconfig.json                                 # TypeScript compiler configuration (decorators enabled)
├── tsconfig.build.json                           # Production build TypeScript configuration
└── README.md
```

---

## 3. Available Scripts

Run these scripts from the **repository root**:

```bash
# Build the backend application
npm run build --workspace=@ai-workspace/api

# Start in development mode with hot reload
npm run start:dev --workspace=@ai-workspace/api

# Start in production mode
npm run start:prod --workspace=@ai-workspace/api

# Validate Prisma schema syntax and relational constraints
npm run prisma:validate --workspace=@ai-workspace/api

# Generate strongly typed Prisma Client
npm run prisma:generate --workspace=@ai-workspace/api
```

---

## 4. Environment Variables

Copy `.env.example` to `.env`:
```bash
cp apps/api/.env.example apps/api/.env
```

| Variable | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development \| production \| test` | No (default: `development`) | Runtime environment |
| `PORT` | `number` | No (default: `4000`) | HTTP listening port |
| `API_PREFIX` | `string` | No (default: `api/v1`) | Global API route prefix |
| `CORS_ORIGIN` | `string` | No (default: `*`) | Allowed CORS origins |
| `DATABASE_URL` | `string (URL)` | **Yes** (for DB features) | Supabase connection pooler URL (e.g. `aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true`) for application runtime queries |
| `DIRECT_URL` | `string (URL)` | **Yes** (for migrations) | Migration connection URL: either direct PostgreSQL connection (`db.[project-ref].supabase.co:5432`) or Supabase Session Pooler (`aws-0-[region].pooler.supabase.com:5432`) used by Prisma CLI |
| `SUPABASE_URL` | `string (URL)` | No | Supabase project REST API URL |
| `SUPABASE_ANON_KEY` | `string` | No | Supabase anonymous public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | No | Supabase service-role key (server-side only — never expose to client) |
| `SUPABASE_JWT_SECRET` | `string` | No | Secret used to verify Supabase JWT tokens |
| `OPENAI_API_KEY` | `string` | No | OpenAI API key (AI features only) |
| `ANTHROPIC_API_KEY` | `string` | No | Anthropic Claude API key (AI features only) |
| `OLLAMA_BASE_URL` | `string (URL)` | No | Ollama local inference server URL (AI features only) |

> **Note on Connection Types and Hostnames:**
> It is important to distinguish direct PostgreSQL connections from Supabase Pooler connections based on their hostname and port:
> - **Direct PostgreSQL (`db.[project-ref].supabase.co:5432`):** Direct database server. Resolves via IPv6. Supports standard DDL and full session features.
> - **Session Pooler (`aws-0-[region].pooler.supabase.com:5432`):** Supavisor session-mode pooler. Provides IPv4 compatibility for environments where IPv6 is not routed, but client sessions lack dynamic database creation privileges.
> - **Transaction Pooler (`aws-0-[region].pooler.supabase.com:6543?pgbouncer=true`):** Supavisor transaction-mode pooler. Designed exclusively for high-concurrency application queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Breaks prepared statements across transaction boundaries and cannot be used for migrations.
>
> In our configuration, `DATABASE_URL` uses the Transaction Pooler (port 6543). `DIRECT_URL` uses either the Direct connection or Session Pooler (port 5432) to execute migration DDL.

> **Graceful degradation:** When `DATABASE_URL` is not set, the application boots successfully and returns a `"database": "not configured"` status on the health endpoint. This allows health checks and Swagger to work during early development before database credentials are configured.

---

## 5. Database Architecture & Multi-Tenant Invariants (Phase 2, Step 2a)

The database schema (`prisma/schema.prisma`) enforces multi-tenant integrity at the database engine level:

### 5.1. Relational Integrity Invariants

1. **Project-Organization Scoping:** `Project` enforces `@@unique([id, organizationId])`. `ProjectMember` references `(projectId, organizationId) → Project(id, organizationId)`, guaranteeing that a project member can never point to a project belonging to another organization.

2. **Organization Member Scoping:** `ProjectMember` references `(organizationId, userId) → OrganizationMember(organizationId, userId)`. A user cannot participate in a project unless they already exist as a member of that project's organization.

3. **Task-Project-Organization Scoping:** `Task` references `(projectId, organizationId) → Project(id, organizationId)`, ensuring tasks are physically impossible to misallocate across tenants.

4. **Safe Task Assignee Deletion:** `Task.assigneeMemberId → ProjectMember.id` with `onDelete: SetNull`. When a member is removed from a project, `assigneeMemberId` is safely nulled without affecting the required `projectId` or `organizationId` columns.

### 5.2. Custom SQL Integrity Constraints (applied during initial migration)

The database schema is augmented with production-hardened PostgreSQL triggers, check constraints, and partial unique indexes documented in [`prisma/custom-migration-sql.md`](prisma/custom-migration-sql.md):

| Constraint / Invariant | Database Mechanism | Concurrency Protection | Status |
| :--- | :--- | :--- | :--- |
| **Task Assignee Project Boundary** | `trg_validate_task_assignee_project` trigger | Locks referenced `project_members` row with `FOR SHARE` on INSERT / UPDATE of `assignee_member_id` or `project_id`. | Defined in SQL spec (Pending migration) |
| **Project Member Identity Immutability** | `trg_prevent_project_member_identity_mutation` trigger | Prevents mutating `project_members` identity columns (`project_id`, `organization_id`, `user_id`) on existing rows using `IS DISTINCT FROM`. Eliminates retroactive assignee impersonation and cross-project transfer vulnerabilities while preserving mutable role attributes (e.g. `project_role`). | Defined in SQL spec (Pending migration) |
| **Active Org Membership Gate** | `trg_validate_active_org_member` trigger | Locks `organization_members` row with `FOR SHARE` on project assignment. Rejects non-`ACTIVE` members. | Defined in SQL spec (Pending migration) |
| **Role System Consistency** | `chk_role_system_consistency` CHECK constraint | Enforces `(is_system = true AND org IS NULL) OR (is_system = false AND org IS NOT NULL)`. | Defined in SQL spec (Pending migration) |
| **System Role Name Uniqueness** | `idx_system_role_unique_name` partial index | Unique index on `roles(name) WHERE organization_id IS NULL`. Protects NULL system role names. | Defined in SQL spec (Pending migration) |
| **Role Ownership Immutability** | `trg_prevent_role_ownership_mutation` trigger | Prevents changing `is_system_role` or transferring `organization_id` on existing roles. | Defined in SQL spec (Pending migration) |
| **Cross-Tenant Role Assignment Gate** | `trg_validate_member_role_org` trigger | Locks `roles` row with `FOR SHARE`. Verifies custom roles belong to member's organization. | Defined in SQL spec (Pending migration) |
| **Hardened Profile Sync** | `on_auth_user_created` trigger | `SECURITY DEFINER` with `SET search_path = ''`, sanitized strings, and explicit NOT NULL checks. | Defined in SQL spec (Pending Supabase run) |
| **Runtime Request Authorization** | NestJS Guards (`OrgTenantGuard`, `ProjectAccessGuard`) | Evaluates active status on every HTTP/WS read and write operation. | **Pending Phase 3/4 implementation** |

### 5.3. Native PostgreSQL Enums

| Enum | Values |
| :--- | :--- |
| `UserStatus` | `ACTIVE`, `SUSPENDED`, `INACTIVE` |
| `OrgMemberStatus` | `INVITED`, `ACTIVE`, `SUSPENDED`, `INACTIVE` |
| `ProjectStatus` | `PLANNING`, `ACTIVE`, `PAUSED`, `ARCHIVED`, `COMPLETED` |
| `ProjectRole` | `LEAD`, `CONTRIBUTOR`, `VIEWER` |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE`, `CANCELLED` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

---

## 6. PrismaService & Database Connection (Phase 2, Step 2b)

### 6.1. Architecture

`PrismaService` (`src/database/prisma.service.ts`) extends `PrismaClient` and implements NestJS lifecycle hooks:

- **`onModuleInit()`** — Called when the application boots. Opens the PostgreSQL connection pool. If `DATABASE_URL` is not configured, logs a warning and continues (graceful degradation). In development mode, subscribes to Prisma query events and logs every SQL query to the NestJS logger for debugging.
- **`onModuleDestroy()`** — Called on graceful shutdown. Closes all open connections, preventing pool exhaustion on Supabase.

`PrismaModule` (`src/database/prisma.module.ts`) is decorated with `@Global()`. This means `PrismaService` is available for injection in every NestJS module without needing to import `PrismaModule` explicitly.

### 6.2. Using PrismaService in a Feature Module

Once Phase 3 and beyond are implemented, any service can inject `PrismaService` directly:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllOrganizations() {
    return this.prisma.organization.findMany({
      where: { deletedAt: null },
    });
  }
}
```

No additional `imports` array entry is needed in `OrganizationsModule` — `PrismaService` is global.

### 6.3. Health Endpoint DB Status

The `GET /api/v1/health` endpoint now reports database connection status:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "AI Engineering Workspace API",
    "version": "1.0.0",
    "database": "connected",
    "timestamp": "2026-11-04T..."
  }
}
```

| `database` value | Meaning |
| :--- | :--- |
| `"connected"` | `DATABASE_URL` is set and Prisma connected successfully |
| `"not configured"` | `DATABASE_URL` is not set — development mode without DB |

---

## 7. Swagger / OpenAPI Documentation

- Interactive UI: `http://localhost:4000/api/docs`
- Raw OpenAPI JSON: `http://localhost:4000/api/docs-json`

---

## 8. Completed Milestones

| Phase | Step | Description | Status |
| :--- | :--- | :--- | :--- |
| Phase 1 | Step 1 | NestJS app bootstrap, health endpoint | ✅ Complete |
| Phase 1 | Step 2 | Global ValidationPipe, HttpExceptionFilter, response transformer, Swagger | ✅ Complete |
| Phase 2 | Step 2a | Prisma 6 installation, schema design, multi-tenant composite constraints | ✅ Complete |
| Phase 2 | Step 2b | PrismaService + PrismaModule, DB integrity SQL documented, env config updated | ✅ Complete |
| Phase 2 | Step 2c | Initial database migration deployed to Supabase PostgreSQL and verified | ✅ Complete |
| Phase 2 | Step 2d | Supabase Auth profile-sync trigger (`on_auth_user_created`) installed and verified via Gmail test signup | ✅ Complete |
| Phase 3 | Step 3a | Production Dependency Security Audit and Safe Remediation | 🔄 In Progress |
| Phase 3 | Step 3b | Supabase ES256 JWT Authentication Foundation (AuthService, JwtAuthGuard, AuthModule) | ✅ Complete |
| Phase 3 | Step 3c | Multi-Tenant Authorization Guards (OrgTenantGuard, ProjectTenantGuard, RolesGuard) | ⏳ Pending |

---

## 9. Production Dependency Security Audit & Remediation (Phase 3, Step 3a)

A security audit was conducted across the `@ai-workspace/api` dependency tree (Node.js 24, npm workspaces). Remediation is in progress.

### 9.1. Current Framework Versions
- **NestJS:** `@nestjs/core@10.4.22`, `@nestjs/common@10.4.22`, `@nestjs/platform-express@10.4.22`
- **Prisma:** `prisma@6.19.3`, `@prisma/client@6.19.3`
- **Zod:** `zod@4.6.7`
- **jose:** `jose@6.2.18`

### 9.2. Completed: Zod 4 Migration
Zod was upgraded from `3.25.76` to `4.6.7`, resolving advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (memory exhaustion on oversized constrained collections).

**Changes made:**
- `apps/api/package.json`: `"zod": "^3.24.1"` → `"zod": "^4.6.7"`.
- `apps/api/src/config/env.config.ts`: `result.error.errors` → `result.error.issues` (Zod 4 API change).

**Verified:**
- `npm run build --workspace=@ai-workspace/api` — passed (zero TypeScript errors).
- `npx prisma validate --schema prisma/schema.prisma` from `apps/api` — passed.
- Environment validation tested: defaults accepted, optional vars omitted, invalid URLs rejected, invalid PORT rejected, invalid NODE_ENV rejected, error messages use `result.error.issues` with readable path formatting.

### 9.3. Remaining Vulnerabilities (Pending Remediation)

`npm audit --omit=dev` reports **15 vulnerabilities (4 moderate, 11 high)** as of 2026-11-24.

The following production dependencies remain on vulnerable versions. No npm overrides or patches have been applied yet. `npm audit fix --force` has not been run.

| Package | Installed Version | Severity | Advisory IDs | Upstream Source |
| :--- | :--- | :--- | :--- | :--- |
| `body-parser` | `1.20.4` | High | GHSA-v422-hmwv-36x6, GHSA-27r3-jxmh-p828 | `@nestjs/platform-express@10.4.22` |
| `multer` | `2.0.2` | High | GHSA-xf7r-hgr6-v32p, GHSA-v52c-386h-88mc, GHSA-5528-5vmv-3xc2, GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm, GHSA-wc9g-mqfw-jrwm, GHSA-qvfw-j98x-7q72, GHSA-535w-7cp7-47q4, GHSA-q7qp-rjg7-q26m | `@nestjs/platform-express@10.4.22` |
| `lodash` | `4.17.21` | High | GHSA-r5fr-rjxr-66jc, GHSA-xxjr-mmjv-4gpg | `@nestjs/config@3.3.0`, `@nestjs/swagger@7.4.2` |
| `js-yaml` | `4.1.0` | High | GHSA-mh29-5h37-fv8m, GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | `@nestjs/swagger@7.4.2` |
| `qs` | `6.14.3` | Moderate | GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw | `body-parser`, `express@4.22.1` |
| `file-type` | `20.4.1` | Moderate | GHSA-5v7r-6r5c-r473, GHSA-j47w-4g3g-c36v | `@nestjs/common@10.4.22` |
| `deepmerge-ts` | `7.1.5` | High | GHSA-ggr8-5vv4-36mx | `@prisma/config@6.19.3` via `prisma@6.19.3` |
| `effect` | `3.21.0` | High | GHSA-7589-6fvf-x4pw | `@prisma/config@6.19.3` via `prisma@6.19.3` |
| `@nestjs/core` | `10.4.22` | Moderate | GHSA-36xv-jgw5-4q75 | Direct dependency (retained on NestJS 10; fix requires NestJS 12) |

### 9.4. Constraints & Next Steps
- **NestJS 10 retained.** Advisory GHSA-36xv-jgw5-4q75 is only resolved in `@nestjs/core@12.6.0`. Upgrading to NestJS 12 is a major breaking change.
- **Prisma 6 retained.** `deepmerge-ts` and `effect` vulnerabilities are transitive via `@prisma/config@6.19.3`.
- **Dev-only advisories excluded.** `npm audit --omit=dev` excludes `@nestjs/cli`, `ajv`, `glob`, `minimatch`, `picomatch`, `tmp`, and `webpack` (build-time only, not shipped in production).
- **Pending:** Evaluate npm `overrides` for safe semver-compatible patches to transitive dependencies (`body-parser`, `multer`, `lodash`, `js-yaml`, `qs`, `file-type`, `deepmerge-ts`, `effect`) without breaking NestJS 10 or Prisma 6.

### 9.5. Verification Commands
Run from the repository root:

```bash
# Audit production dependencies only
npm audit --omit=dev

# Build and validate
npm run build:shared
npm run prisma:validate --workspace=@ai-workspace/api
npm run prisma:generate --workspace=@ai-workspace/api
npm run build --workspace=@ai-workspace/api
```

---

## 10. Supabase ES256 JWT Authentication Foundation (Phase 3, Step 3b)

Phase 3 Step 3b establishes the stateless cryptographic authentication foundation for `@ai-workspace/api` using Supabase Auth asymmetric JSON Web Tokens (JWT).

### 10.1. Architecture & Security Implementation
- **Asymmetric ES256 Verification:** Supabase Auth tokens are signed using ECC P-256. Cryptographic verification is handled exclusively via `jose@6.2.18` enforcing `algorithms: ['ES256']`. Symmetric HMAC (`HS256`), `none`, and `SUPABASE_JWT_SECRET` are never used or trusted.
- **Remote JWKS Endpoint:** Public keys are fetched from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` using `createRemoteJWKSet()` with in-memory caching (`cacheMaxAge: 10m`) and rotation cooldown (`cooldownDuration: 30s`).
- **Claim Validations:**
  - **Issuer:** Strictly validated against `${SUPABASE_URL}/auth/v1`.
  - **Audience:** Strictly validated against `authenticated`.
  - **Expiration:** Validated automatically by `jwtVerify`.
  - **Subject (`sub`):** Validated against a strict UUID format (`/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/`).
- **Hardened Bearer Extraction:**
  - Evaluates authorization headers with strict regex matching: `/^Bearer[ \t]+(\S+)$/i`.
  - Case-insensitive scheme (`bearer`, `Bearer`, `BEARER`).
  - Supports multiple space and tab whitespace separators.
  - Rejects missing, empty, or extra-token headers (`Bearer <token> extra`).
  - Fails closed on duplicate `Authorization` headers (array types) by rejecting non-string inputs.
- **Error Boundaries:**
  - **HTTP 401 Unauthorized:** Missing, empty, malformed, expired, invalid-signature tokens, or invalid claims.
  - **HTTP 503 Service Unavailable:** Upstream JWKS network/fetch unavailability when a valid cached key is absent.
  - **HTTP 500 Internal Server Error:** Missing server configuration (`SUPABASE_URL`) returns a safe generic message without leaking secrets.
- **Zero Sensitive Logging:** Bearer tokens, secrets, and raw Authorization headers are never logged.
- **Stateless Separation:** No database access or Prisma queries occur during JWT verification. Database profile status and tenant checks are strictly decoupled for downstream authorization guards (Step 3c).
- **Scope:** `JwtAuthGuard` is exported by `AuthModule` for explicit controller/route decoration and is **not registered globally**.

### 10.2. Components & Artifacts
- `AuthService` (`apps/api/src/auth/auth.service.ts`): Reusable remote JWKS resolver and token verification engine.
- `JwtAuthGuard` (`apps/api/src/auth/guards/jwt-auth.guard.ts`): CanActivate guard extracting Bearer tokens and attaching verified identities to `request.user`. Respects `@Public()` metadata.
- `AuthModule` (`apps/api/src/auth/auth.module.ts`): Registers and exports `AuthService` and `JwtAuthGuard`; imported into `AppModule`.
- `@Public()` (`apps/api/src/auth/decorators/public.decorator.ts`): Custom decorator marking public routes (`isPublic` metadata).
- `@CurrentUser()` (`apps/api/src/auth/decorators/current-user.decorator.ts`): Custom parameter decorator extracting verified user context or sub-properties from `request.user`.
- `AuthenticatedUser` (`apps/api/src/auth/interfaces/authenticated-user.interface.ts`): Readonly interface (`id: string`, optional `email?: string`, optional `role?: string`, `appMetadata: Readonly<Record<string, unknown>>`, `userMetadata: Readonly<Record<string, unknown>>`) with frozen empty-object defaults.

### 10.3. Verification & Test Suite
Unit tests are implemented natively using Node.js's built-in test runner in `apps/api/test/auth.test.js`, testing with ephemeral in-memory P-256 keypairs with zero network or database dependencies:
- **Test execution:** `node --test apps/api/test/auth.test.js`
- **Result:** **14 passing, 0 failing** (0 errors).
- **Scenarios covered:**
  1. Valid ES256 token verification & guard attachment.
  2. Untrusted / invalid P-256 signature rejection.
  3. Expired token rejection.
  4. Wrong issuer rejection.
  5. Wrong audience rejection.
  6. Unsupported algorithm (HS256) rejection.
  7. Invalid UUID subject rejection.
  8. Missing / malformed Bearer token rejection.
  8b. Bearer token whitespace variants (multiple spaces, tabs, case-insensitivity) acceptance.
  9. `@Public()` route bypass.
  10. Missing `SUPABASE_URL` configuration safe 500.
  11. JWKS network/fetch failure 503 Service Unavailable.
  12. Missing email and metadata safe defaults (frozen objects).
- **Build verification:** `npm run build --workspace=@ai-workspace/api` passed with zero TypeScript errors.

---

## 11. Initial Database Migration Specification (Phase 2, Step 2c)

The initial migration has been synthesized locally in `apps/api/prisma/migrations/20261107120000_init/`:

```
apps/api/prisma/migrations/
├── migration_lock.toml              # Identifies provider as "postgresql"
└── 20261107120000_init/
    └── migration.sql                # Complete atomic DDL (Prisma baseline + custom triggers)
```

### 11.1. Transaction & Execution Architecture
* **Explicit Transaction Boundaries:** The migration is wrapped in explicit `BEGIN;` and `COMMIT;` blocks, guaranteeing that all 10 tables, 6 enums, 19 indexes, 17 foreign keys, 5 triggers, 10 RLS-enabled tables with default-deny behavior and zero client-facing policies, and 2 check/unique constraints deploy atomically. If any statement encounters an error, the entire migration rolls back without leaving partial tables.
* **All Statements Transaction-Compatible:** Zero non-transactional statements (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `CREATE DATABASE`) are present.
* **Separation of Supabase Auth Schema:** In accordance with tenant architecture, the Supabase Auth profile synchronization trigger (`on_auth_user_created`) resides on `auth.users` and is managed separately via the Supabase Dashboard SQL Editor, keeping Prisma's migration scope strictly contained to the `public` schema.

### 11.2. Custom PostgreSQL Triggers (5 Triggers)
The migration includes 5 custom triggers enforcing tenant boundary invariants and immutability:
1. `trg_prevent_role_ownership_mutation` on `public.roles`: Protects system roles and prevents transferring custom roles between organizations (`BEFORE UPDATE OF organization_id, is_system_role`).
2. `trg_validate_member_role_org` on `public.organization_members`: Validates that assigned custom roles belong to the same organization, using `FOR SHARE` row locking against concurrent role reassignment (`BEFORE INSERT OR UPDATE OF role_id, organization_id`).
3. `trg_validate_active_org_member` on `public.project_members`: Validates that users added to projects hold an `ACTIVE` organization membership, using `FOR SHARE` row locking against concurrent status changes (`BEFORE INSERT OR UPDATE OF organization_id, user_id`).
4. `trg_prevent_project_member_identity_mutation` on `public.project_members`: Enforces complete immutability of `project_id`, `organization_id`, and `user_id` using `IS DISTINCT FROM`, preventing historical task assignment corruption (`BEFORE UPDATE OF project_id, organization_id, user_id`).
5. `trg_validate_task_assignee_project` on `public.tasks`: Validates that task assignees belong to the same project as the task, using `FOR SHARE` row locking (`BEFORE INSERT OR UPDATE OF assignee_member_id, project_id`).

### 11.3. Row Level Security (RLS) Strategy & Defense-in-Depth
* **Enabled on All 10 Public Tables:** `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;` is executed for all ten tables (`profiles`, `organizations`, `roles`, `permissions`, `role_permissions`, `organization_members`, `projects`, `project_members`, `tasks`, `task_comments`).
* **Default-Deny for Client SDKs:** Because zero permissive client policies (`CREATE POLICY`) are created, any direct request via PostgREST, Supabase Studio client libraries, or the `anon` / `authenticated` roles is rejected (`DENY ALL`).
* **No `FORCE ROW LEVEL SECURITY`:** `FORCE ROW LEVEL SECURITY` is intentionally omitted so the database owner connection used by Prisma (`postgres` user) retains unhindered administrative access.
* **Privilege Revocation:** Direct table privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) are explicitly revoked from `PUBLIC`, `anon`, and `authenticated`. Additionally, `EXECUTE` privileges on all 5 custom trigger functions are revoked from `PUBLIC`, `anon`, and `authenticated`.
* **NestJS Tenant Guards Remain Mandatory:** RLS provides perimeter defense against direct database exposure via PostgREST. Application-level multi-tenancy authorization and fine-grained data isolation are part of the planned NestJS enforcement architecture. JwtAuthGuard is implemented in Phase 3 Step 3b; OrgTenantGuard, ProjectTenantGuard, and RBAC guards are planned for Phase 3 Step 3c and are not yet implemented.

### 11.4. Deployment Status
* **Current Status:** Successfully deployed to Supabase PostgreSQL via `npx prisma migrate deploy`. All 10 tables, 6 enums, 19 indexes, 17 foreign keys, 5 triggers, RLS on all 10 tables, and privilege revocations were applied atomically. The Supabase Auth profile synchronization trigger (`on_auth_user_created`) was installed separately via the Supabase SQL Editor and verified with a Gmail test signup that created a matching `public.profiles` row with the correct UUID.
