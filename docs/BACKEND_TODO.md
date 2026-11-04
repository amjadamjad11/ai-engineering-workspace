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
- [ ] **Shared Contracts Package Setup (`packages/shared`)**
  - [ ] Initialize `packages/shared/package.json` and `tsconfig.json`.
  - [ ] Define shared TypeScript contracts: API response envelopes, error codes, auth tokens, profiles, organizations, projects, tasks.
- [ ] **NestJS Backend Initialization (`apps/api`)**
  - [ ] Initialize NestJS modular application in `apps/api`.
  - [ ] Configure global validation pipe (`ValidationPipe` with whitelist and forbidNonWhitelisted).
  - [ ] Configure global exception filter (`HttpExceptionFilter`) to enforce uniform API response envelope.
  - [ ] Configure Swagger / OpenAPI module (`/api/docs`).
  - [ ] Configure environment variable validation via `@nestjs/config` and Zod.
- [ ] **Phase 1 Architectural Sign-off**
  - [ ] Present architecture proposal to founder Amjad.
  - [ ] Await review and approval before proceeding to Phase 2.

---

## Phase 2: Database Design, Migrations & Security Policies

- [ ] Initialize Prisma ORM in `apps/api`.
- [ ] Write `schema.prisma` mapping the complete database schema:
  - Identity & Org (`profiles`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`).
  - Projects (`projects`, `project_members`, `project_settings`, `project_documents`, `project_milestones`).
  - Tasks (`tasks`, `task_dependencies`, `task_comments`, `task_assignees`).
  - Communication (`conversations`, `conversation_members`, `messages`, `message_attachments`).
  - Knowledge & Memory (`knowledge_sources`, `knowledge_chunks` with `vector(1536)`, `engineering_decisions`, `document_versions`).
  - AI & Agents (`ai_providers`, `ai_models`, `ai_runs`, `ai_usage_records`, `agent_configurations`, `agent_executions`, `ai_approvals`).
  - Integrations (`integrations`, `github_installations`, `github_repositories`, `github_webhook_events`, `notifications`, `audit_logs`).
- [ ] Create initial SQL migration for Supabase PostgreSQL.
- [ ] Enable pgvector extension and create HNSW vector index on `knowledge_chunks(embedding)`.
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

