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
│   └── schema.prisma                             # Definitive Prisma 6 relational schema
├── src/
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts         # Global exception filter (ApiErrorResponse envelope)
│   │   └── interceptors/
│   │       └── transform-response.interceptor.ts # Global response transformer (ApiResponse envelope)
│   ├── config/
│   │   ├── env.config.ts                         # Zod-validated environment schema
│   │   └── swagger.config.ts                     # OpenAPI / Swagger configuration
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

Run these scripts from the repository root:

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

| Variable | Type | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development \| production \| test` | Runtime environment |
| `PORT` | `number` (default: 4000) | HTTP listening port |
| `API_PREFIX` | `string` (default: api/v1) | Global API route prefix |
| `CORS_ORIGIN`| `string` (default: *) | Allowed CORS origins |
| `DATABASE_URL`| `string` | Supabase pooled connection string (Port 6543 via Supavisor) |
| `DIRECT_URL`  | `string` | Supabase direct connection string (Port 5432) for migrations |
| `SUPABASE_URL`| `string` | Supabase project URL |
| `SUPABASE_ANON_KEY` | `string` | Supabase anonymous public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | Supabase service-role key (server-side only) |

---

## 5. Database Architecture & Multi-Tenant Invariants (Phase 2, Step 2a)

The database schema (`prisma/schema.prisma`) enforces multi-tenant integrity at the database engine level:

### 5.1. Relational Integrity Invariants
1. **Project-Organization Scoping:** `Project` enforces `@@unique([id, organizationId])`. `ProjectMember` references `(projectId, organizationId) -> Project(id, organizationId)`, guaranteeing that a project member can never point to a project belonging to another organization.
2. **Organization Member Scoping:** `ProjectMember` references `(organizationId, userId) -> OrganizationMember(organizationId, userId)`. A user cannot participate in a project unless they already exist as an active member of that project's organization.
3. **Task-Project-Organization Scoping:** `Task` references `(projectId, organizationId) -> Project(id, organizationId)`, ensuring tasks are physically impossible to misallocate across tenants.
4. **Safe Task Assignee Deletion:** `Task` assigns developers via `assigneeMemberId -> ProjectMember.id` (`onDelete: SetNull`). When a member is removed from a project, `assigneeMemberId` is safely nulled without affecting the required `projectId` or `organizationId` columns.

### 5.2. Native PostgreSQL Enums
* `UserStatus`: `ACTIVE`, `SUSPENDED`, `INACTIVE`
* `ProjectStatus`: `PLANNING`, `ACTIVE`, `PAUSED`, `ARCHIVED`, `COMPLETED`
* `ProjectRole`: `LEAD`, `CONTRIBUTOR`, `VIEWER`
* `TaskStatus`: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE`, `CANCELLED`
* `TaskPriority`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`

---

## 6. Swagger / OpenAPI Documentation
* Interactive UI: `http://localhost:4000/api/docs`
* Raw OpenAPI JSON: `http://localhost:4000/api/docs-json`
