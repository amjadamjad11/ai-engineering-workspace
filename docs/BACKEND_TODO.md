# Backend Engineering Master Task List & Roadmap

**Project:** AI Engineering Workspace  
**Backend Lead:** Amjad  
**Status Tracker:** Version 1.0 (Phase 1 In Progress)  

---

## Phase 1: Foundation, Architecture & Setup (CURRENT PHASE)

- [x] **Audit Workspace & Environment**
  - [x] Inspect existing repo structure (`apps/api`, `apps/web`, `packages/shared`, `docs`).
  - [x] Confirm Node.js (`v24.18.0`) and package management availability.
- [x] **System Documentation & Specifications**
  - [x] Write `docs/BACKEND_STATUS.md`
  - [x] Write `docs/DATABASE_SCHEMA.md` with full ER diagram
  - [x] Write `docs/SECURITY_PLAN.md` with multi-tenant guard hierarchy
  - [x] Write `docs/API_SPECIFICATION.md` with envelope standards
  - [x] Write `docs/AI_ARCHITECTURE.md` with provider adapter interfaces
  - [x] Write `docs/RAG_ARCHITECTURE.md` with permission-aware vector pipeline
  - [x] Write `docs/MCP_SPECIFICATION.md` with tool definitions
  - [x] Write `docs/BACKEND_TESTING.md` with security test matrix
  - [x] Write `docs/BACKEND_TODO.md` (this roadmap)
- [x] **Shared Contracts Package Setup (`packages/shared`)**
  - [x] Initialize `packages/shared/package.json` and `tsconfig.json`.
  - [x] Define shared TypeScript contracts: API response envelopes, error codes, auth tokens, profiles, organizations, projects, tasks.
- [x] **NestJS Backend Initialization (`apps/api`)**
  - [x] Initialize NestJS modular application in `apps/api`.
  - [x] Configure global validation pipe (`ValidationPipe` with whitelist and forbidNonWhitelisted).
  - [x] Configure global exception filter (`HttpExceptionFilter`) to enforce uniform API response envelope.
  - [x] Configure Swagger / OpenAPI module (`/api/docs`).
  - [x] Configure environment variable validation via `@nestjs/config` and Zod.
- [x] **Phase 1 Foundation Verification & Testing**
  - [x] Verify compilation of `@ai-workspace/shared` and `@ai-workspace/api`.
  - [x] Verify live health check endpoint, validation pipe, and standard envelopes.
  - [x] Verify Swagger UI at `/api/docs`.
- [ ] **Phase 1 Sign-off & Transition to Phase 2**
  - [ ] Review Phase 1 results with Amjad.
  - [ ] Await approval to begin Phase 2: Database Design, Prisma Schema & Migrations.

---

## Phase 2: Database Design, Migrations & Security Policies

- [x] **Step 2a — Prisma 6 Installation & Multi-Tenant Schema Design**
  - [x] Install `prisma` and `@prisma/client` (v6.19.3).
  - [x] Write `schema.prisma` with 10 models: `Profile`, `Organization`, `Role`, `Permission`, `RolePermission`, `OrganizationMember`, `Project`, `ProjectMember`, `Task`, `TaskComment`.
  - [x] Implement composite unique constraints enabling composite FK targets.
  - [x] Enforce cross-tenant isolation via composite FKs on `ProjectMember` and `Task`.
  - [x] Prisma schema validated (`prisma validate` ✅).
  - [x] Prisma Client generated successfully.
  - [x] TypeScript build passes with 0 errors.

- [x] **Step 2b — PrismaService, PrismaModule & Database Integrity SQL**
  - [x] Create `src/database/prisma.service.ts` — extends `PrismaClient` with NestJS lifecycle hooks.
  - [x] Implement graceful degradation: app boots without crash when `DATABASE_URL` is not set.
  - [x] Add `isDatabaseConnected` getter for health endpoint reporting.
  - [x] Create `src/database/prisma.module.ts` — `@Global()` module exporting `PrismaService`.
  - [x] Register `PrismaModule` in `AppModule`.
  - [x] Update `AppService` to inject `PrismaService` and report DB status in health response.
  - [x] Add `DATABASE_URL` and `DIRECT_URL` to `env.config.ts` Zod schema.
  - [x] Document all custom SQL (`trg_validate_task_assignee_project`, `trg_validate_active_org_member`, `chk_role_system_consistency`, `idx_system_role_unique_name`, Supabase auth trigger) in `prisma/custom-migration-sql.md`.
  - [x] TypeScript build passes with 0 errors.
  - [x] Health endpoint verified: `GET /api/v1/health` → 200 OK with `"database": "not configured"`.

- [ ] **Step 2c — Initial Database Migration** *(requires Supabase credentials)*
  - [ ] Add Supabase `DATABASE_URL` and `DIRECT_URL` to `apps/api/.env`.
  - [ ] Run `prisma migrate dev --create-only` to generate migration SQL.
  - [ ] Append custom SQL from `prisma/custom-migration-sql.md` to migration file.
  - [ ] Run `prisma migrate dev` to apply migration.
  - [ ] Run Supabase auth trigger SQL in Supabase SQL Editor.
  - [ ] Verify `GET /api/v1/health` returns `"database": "connected"`.

- [ ] Enable pgvector extension and create HNSW vector index (Phase 6 prerequisite).
- [ ] Implement database seed scripts with default roles and permissions.

---

## Phase 3: Authentication, Profiles & Organization Management

- [ ] Implement `AuthenticationModule` with Supabase JWT validation strategy.
- [ ] Implement `JwtAuthGuard` and `@CurrentUser()` parameter decorator.
- [ ] Implement `ProfilesModule` (`GET /api/v1/profile/me`, `PATCH /api/v1/profile/me`).
- [ ] Implement `OrganizationsModule` (CRUD, slugs, owner initialization).
- [ ] Implement `OrganizationMembersModule` (invitation flow, role assignment).
- [ ] Implement `OrgTenantGuard` to enforce organization boundary.

---

## Phase 4: Projects, Members, Roles & Granular Permissions

- [ ] Implement `ProjectsModule` (CRUD, status filtering, project settings).
- [ ] Implement `ProjectMembersModule` (roster management, project-level roles).
- [ ] Implement `ProjectAccessGuard` (enforce project belongs to verified org and user has access).
- [ ] Implement `@RequirePermissions()` decorator and `PermissionsGuard`.
- [ ] Implement `ProjectDocumentsModule` and `DocumentVersionsModule`.

---

## Phase 5: Tasks, Milestones, Conversations & Collaboration

- [ ] Implement `TasksModule` (CRUD, status transitions, priorities, assignments).
- [ ] Implement `TaskDependenciesModule` (DAG cycle detection).
- [ ] Implement `MilestonesModule`.
- [ ] Implement `ConversationsModule` and `MessagesModule`.
- [ ] Configure Supabase Realtime subscriptions and broadcast channels.

---

## Phase 6: AI Provider Integration, RAG & Project Memory

- [ ] Implement `AIModule` with `IAIProviderAdapter`.
- [ ] Implement OpenAI Adapter (`gpt-4o`, `text-embedding-3-small`).
- [ ] Implement Anthropic Adapter (`claude-3-5-sonnet`).
- [ ] Implement local Ollama Adapter.
- [ ] Implement token calculation and quota guard.
- [ ] Implement `KnowledgeModule` (document ingestion, recursive chunking, embedding generation).
- [ ] Implement permission-aware RAG vector search endpoint (`POST /ai/chat`).

---

## Phase 7: Specialized AI Agents & Human-in-the-Loop Orchestration

- [ ] Implement agent routing engine for specialized personas (Frontend, Backend, QA, Architecture, DevOps).
- [ ] Implement step-by-step execution tracer (`agent_executions`).
- [ ] Implement Human-in-the-Loop approval gate (`ai_approvals`).
- [ ] Implement WebSocket live agent execution stream.

---

## Phase 8: Model Context Protocol (MCP) Server & IDE Integrations

- [ ] Implement MCP Server endpoint/transport (JSON-RPC over SSE).
- [ ] Implement Personal Access Token (PAT) authentication for IDE clients.
- [ ] Register MCP Tools (`get_project_context`, `get_my_tasks`, `search_project_memory`, `create_task`, `submit_progress_update`).

---

## Phase 9: GitHub Integration, QA Services & Event Webhooks

- [ ] Implement `GitHubModule` with GitHub App authentication.
- [ ] Implement webhook receiver with HMAC SHA-256 verification.
- [ ] Process push, pull request, and issue events into project memory.

---

## Phase 10: Collaborative DevSpace Backend Infrastructure

- [ ] Design container runtime interfaces for isolated execution environments.
- [ ] Specify workspace provisioning and ephemeral session management.

---

## Phase 11: Security Hardening, Performance & Reliability

- [ ] Run full security test matrix (`TC-SEC-01` to `TC-SEC-06`).
- [ ] Implement Redis caching for hot project configurations.
- [ ] Configure rate limiting (ThrottlerModule).

---

## Phase 12: Production Deployment, Monitoring & Launch

- [ ] Production environment variable configuration and secret manager integration.
- [ ] Setup structured logging (Pino/Winston) and APM monitoring.
- [ ] Conduct final deployment verification.

