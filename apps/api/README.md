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
| Phase 2 | Step 2c | Initial database migration generation (local SQL synthesized, wrapped in BEGIN/COMMIT, pending deployment) | ⏳ Generated Locally (Pending Approval) |
| Phase 3 | — | Authentication module (JwtAuthGuard, OrgTenantGuard, etc.) | ⏳ Pending |

---

## 9. Initial Database Migration Specification (Phase 2, Step 2c)

The initial migration has been synthesized locally in `apps/api/prisma/migrations/20261107120000_init/`:

```
apps/api/prisma/migrations/
├── migration_lock.toml              # Identifies provider as "postgresql"
└── 20261107120000_init/
    └── migration.sql                # Complete atomic DDL (Prisma baseline + custom triggers)
```

### 9.1. Transaction & Execution Architecture
* **Explicit Transaction Boundaries:** The migration is wrapped in explicit `BEGIN;` and `COMMIT;` blocks, guaranteeing that all 10 tables, 6 enums, 16 indexes, 16 foreign keys, 5 triggers, 10 RLS-enabled tables with default-deny behavior and zero client-facing policies, and 2 check/unique constraints deploy atomically. If any statement encounters an error, the entire migration rolls back without leaving partial tables.
* **All Statements Transaction-Compatible:** Zero non-transactional statements (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `CREATE DATABASE`) are present.
* **Separation of Supabase Auth Schema:** In accordance with tenant architecture, the Supabase Auth profile synchronization trigger (`on_auth_user_created`) resides on `auth.users` and is managed separately via the Supabase Dashboard SQL Editor, keeping Prisma's migration scope strictly contained to the `public` schema.

### 9.2. Custom PostgreSQL Triggers (5 Triggers)
The migration includes 5 custom triggers enforcing tenant boundary invariants and immutability:
1. `trg_prevent_role_ownership_mutation` on `public.roles`: Protects system roles and prevents transferring custom roles between organizations (`BEFORE UPDATE OF organization_id, is_system_role`).
2. `trg_validate_member_role_org` on `public.organization_members`: Validates that assigned custom roles belong to the same organization, using `FOR SHARE` row locking against concurrent role reassignment (`BEFORE INSERT OR UPDATE OF role_id, organization_id`).
3. `trg_validate_active_org_member` on `public.project_members`: Validates that users added to projects hold an `ACTIVE` organization membership, using `FOR SHARE` row locking against concurrent status changes (`BEFORE INSERT OR UPDATE OF organization_id, user_id`).
4. `trg_prevent_project_member_identity_mutation` on `public.project_members`: Enforces complete immutability of `project_id`, `organization_id`, and `user_id` using `IS DISTINCT FROM`, preventing historical task assignment corruption (`BEFORE UPDATE OF project_id, organization_id, user_id`).
5. `trg_validate_task_assignee_project` on `public.tasks`: Validates that task assignees belong to the same project as the task, using `FOR SHARE` row locking (`BEFORE INSERT OR UPDATE OF assignee_member_id, project_id`).

### 9.3. Row Level Security (RLS) Strategy & Defense-in-Depth
* **Enabled on All 10 Public Tables:** `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;` is executed for all ten tables (`profiles`, `organizations`, `roles`, `permissions`, `role_permissions`, `organization_members`, `projects`, `project_members`, `tasks`, `task_comments`).
* **Default-Deny for Client SDKs:** Because zero permissive client policies (`CREATE POLICY`) are created, any direct request via PostgREST, Supabase Studio client libraries, or the `anon` / `authenticated` roles is rejected (`DENY ALL`).
* **No `FORCE ROW LEVEL SECURITY`:** `FORCE ROW LEVEL SECURITY` is intentionally omitted so the database owner connection used by Prisma (`postgres` user) retains unhindered administrative access.
* **Privilege Revocation:** Direct table privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) are explicitly revoked from `PUBLIC`, `anon`, and `authenticated`. Additionally, `EXECUTE` privileges on all 5 custom trigger functions are revoked from `PUBLIC`, `anon`, and `authenticated`.
* **NestJS Tenant Guards Remain Mandatory:** RLS provides perimeter defense against direct database exposure via PostgREST. Application-level multi-tenancy authorization and fine-grained data isolation continue to be enforced in the NestJS backend via `JwtAuthGuard`, `OrgTenantGuard`, `ProjectTenantGuard`, and RBAC guards.

### 9.4. Deployment Readiness
* **Current Status:** Generated and verified locally. **Not yet deployed to Supabase PostgreSQL.** Deployment will occur via `npx prisma migrate deploy` only after explicit user approval.
