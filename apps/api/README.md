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
| `DATABASE_URL` | `string (URL)` | **Yes** (for DB features) | Supabase Supavisor pooled connection (port **6543**) — used by Prisma Client at runtime |
| `DIRECT_URL` | `string (URL)` | **Yes** (for migrations) | Supabase direct connection (port **5432**) — used ONLY by `prisma migrate` CLI |
| `SUPABASE_URL` | `string (URL)` | No | Supabase project REST API URL |
| `SUPABASE_ANON_KEY` | `string` | No | Supabase anonymous public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | No | Supabase service-role key (server-side only — never expose to client) |
| `SUPABASE_JWT_SECRET` | `string` | No | Secret used to verify Supabase JWT tokens |
| `OPENAI_API_KEY` | `string` | No | OpenAI API key (AI features only) |
| `ANTHROPIC_API_KEY` | `string` | No | Anthropic Claude API key (AI features only) |
| `OLLAMA_BASE_URL` | `string (URL)` | No | Ollama local inference server URL (AI features only) |

> **Note on DATABASE_URL vs DIRECT_URL:**  
> Supabase provides two connection strings. `DATABASE_URL` goes through Supavisor (the connection pooler) on port 6543 — this is what your running application uses. `DIRECT_URL` connects directly to PostgreSQL on port 5432 — this is what `prisma migrate` uses because schema migrations require a persistent, non-pooled connection. Using the pooler URL for migrations can cause intermittent failures.

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

Three integrity rules are enforced via raw PostgreSQL SQL added to the initial migration file. These are documented in `prisma/custom-migration-sql.md`:

| Constraint | Type | Enforcement |
| :--- | :--- | :--- |
| Task assignee must belong to task's project | PostgreSQL trigger | `trg_validate_task_assignee_project` |
| Org member must be `ACTIVE` to join a project | PostgreSQL trigger | `trg_validate_active_org_member` |
| System roles must have `organizationId = NULL` | CHECK constraint | `chk_role_system_consistency` |
| System role names must be globally unique | Partial unique index | `idx_system_role_unique_name` |
| Cross-org role assignment prevention | Application layer | `OrganizationMembersService` guard |
| Profile auto-created on Supabase user registration | Supabase trigger | `on_auth_user_created` (run in Supabase SQL Editor) |

### 5.3. Native PostgreSQL Enums

| Enum | Values |
| :--- | :--- |
| `UserStatus` | `ACTIVE`, `SUSPENDED`, `INACTIVE` |
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
| Phase 2 | Step 2c | Initial database migration (requires Supabase credentials) | ⏳ Pending |
| Phase 3 | — | Authentication module (JwtAuthGuard, OrgTenantGuard, etc.) | ⏳ Pending |
