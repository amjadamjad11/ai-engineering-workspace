# AI Engineering Workspace

> **ONE WORKSPACE. EVERY DEVELOPER. ONE SHARED AI BRAIN.**

AI Engineering Workspace is an AI-powered collaborative software engineering SaaS platform. It connects organizations, engineering teams, project management, shared architectural memory, and specialized AI agents into a single unified workspace.

---

## 1. Monorepo Structure

```
ai-engineering-workspace/
├── apps/
│   ├── api/                   # Backend API (NestJS modular monolith) [Backend Lead]
│   └── web/                   # Frontend Web Application (React / Next.js) [Frontend Founder]
├── packages/
│   └── shared/                # Shared TypeScript contracts, DTOs, and schemas
│       ├── src/
│       │   ├── contracts/     # API Envelopes, Auth, Org, Project, Task, AI contracts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/                      # Central technical documentation & architecture specs
│   ├── BACKEND_STATUS.md      # Current phase status and audit log
│   ├── DATABASE_SCHEMA.md     # Relational & pgvector database architecture
│   ├── SECURITY_PLAN.md       # Multi-tenant security & authorization guards
│   ├── API_SPECIFICATION.md   # REST API contracts & endpoint docs
│   ├── AI_ARCHITECTURE.md     # AI provider adapter pattern & agent orchestration
│   ├── RAG_ARCHITECTURE.md    # Permission-aware project memory pipeline
│   ├── MCP_SPECIFICATION.md   # Model Context Protocol server specs
│   ├── BACKEND_TESTING.md     # Testing strategy & cross-tenant security test matrix
│   ├── BACKEND_TODO.md        # 12-phase development roadmap
│   └── GIT_WORKFLOW.md        # Branching model, PR process, and merge guidelines
├── package.json               # Root monorepo workspace configuration
├── .gitignore
└── README.md
```

---

## 2. Git Branching Strategy & Roles

To ensure clean, unconflicted parallel development between Frontend and Backend, the repository follows a strict branch and PR workflow.

### Branch Strategy
* `main`: **Production / Source of Truth**. Protected branch. Only merged via tested and approved Pull Requests.
* `frontend`: **Dedicated Frontend Development Branch**. The frontend founder develops the client application in `apps/web` on this branch.
* `backend`: **Dedicated Backend Development Branch**. The backend lead develops API services, migrations, and shared packages in `apps/api` and `packages/shared`.

### Merging to Main
1. Once frontend features or backend modules are complete and tested, a Pull Request is opened against `main`.
2. The repository owner reviews, verifies the build, and merges into `main`.
3. For detailed branch commands and coordination rules, see [`docs/GIT_WORKFLOW.md`](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/GIT_WORKFLOW.md).

---

## 3. Technology Stack

* **Language:** TypeScript
* **Backend Framework:** NestJS (Modular Monolith)
* **Database:** PostgreSQL (Supabase) + Prisma ORM + pgvector
* **Authentication:** Supabase Auth + JWT Guards
* **AI Providers:** Pluggable adapter layer supporting OpenAI, Anthropic, and local Ollama
* **Realtime:** Supabase Realtime / WebSockets
* **External AI Integration:** Model Context Protocol (MCP) Server

---

## 4. Documentation Index

Detailed architectural specifications are located in the `docs/` directory:
* [Backend Status & Audit](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/BACKEND_STATUS.md)
* [Database Schema & ER Diagram](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/DATABASE_SCHEMA.md)
* [Multi-Tenant Security Plan](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/SECURITY_PLAN.md)
* [API Specifications & Contracts](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/API_SPECIFICATION.md)
* [AI Integration & Agent Architecture](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/AI_ARCHITECTURE.md)
* [RAG & Project Memory Engine](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/RAG_ARCHITECTURE.md)
* [Model Context Protocol (MCP) Server](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/MCP_SPECIFICATION.md)
* [Backend Testing Strategy](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/BACKEND_TESTING.md)
* [Roadmap & Master Checklist](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/BACKEND_TODO.md)
* [Git Workflow & Branching Guidelines](file:///c:/Users/amjad/Desktop/AI_Engineering_Workspace/docs/GIT_WORKFLOW.md)
