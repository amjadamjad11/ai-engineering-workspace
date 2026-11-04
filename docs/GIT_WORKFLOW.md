# Git Branching Strategy & Development Workflow

**Project:** AI Engineering Workspace  
**Remote URL:** `https://github.com/amjadamjad11/ai-engineering-workspace.git`  
**Classification:** Engineering Collaboration Standard  

---

## 1. Branch Strategy Overview

To maintain stability, allow independent velocity, and protect the production codebase, the repository uses a domain-isolated branching strategy:

```
                  [main] (Production Source of Truth)
                    ^
                    | (PR Review & Merge by Repo Owner)
         +----------+----------+
         |                     |
     [backend]             [frontend]
  (Backend Lead:        (Frontend Founder:
   apps/api,             apps/web)
   packages/shared,
   docs)
```

---

## 2. Core Branches

### 1. `main` (Protected)
* **Purpose:** Represents production-ready, verified code.
* **Rules:**
  * Direct commits to `main` are restricted.
  * Changes are merged exclusively via Pull Requests (PRs).
  * Only the repository owner can merge PRs into `main`.

### 2. `frontend` (Dedicated Frontend Branch)
* **Purpose:** All frontend development (UI components, pages, client-side state, API client consumption) in `apps/web`.
* **Owner:** Frontend Founder.
* **Scope:** `apps/web/`. Must not alter backend domain logic in `apps/api/`.

### 3. `backend` (Dedicated Backend Branch)
* **Purpose:** All backend services, controllers, guards, database migrations, AI adapters, and MCP server tools.
* **Owner:** Backend Lead (Amjad).
* **Scope:** `apps/api/`, `packages/shared/`, `docs/`.

---

## 3. Developer Workflow: Frontend Founder

### Step 1: Switch to the Frontend Branch
```bash
# Fetch latest remote changes
git fetch origin

# Switch to the dedicated frontend branch
git checkout frontend

# Pull the latest base code
git pull origin frontend
```

### Step 2: Implement Features in `apps/web`
* Build UI components, screens, and API integration in `apps/web/`.
* Import shared types and contracts from `@ai-workspace/shared` (`packages/shared`).
* Reference `docs/API_SPECIFICATION.md` for exact request/response schemas.

### Step 3: Commit and Push Changes
```bash
# Stage frontend changes
git add apps/web/

# Commit with descriptive message
git commit -m "feat(web): implement dashboard navigation and task board view"

# Push to the remote frontend branch
git push origin frontend
```

### Step 4: Open a Pull Request into `main`
1. Navigate to the GitHub repository: `https://github.com/amjadamjad11/ai-engineering-workspace`.
2. Open a Pull Request from `frontend` into `main`.
3. Provide a summary of implemented UI views and integration points tested.

---

## 4. Repository Owner Merge Protocol

Before merging any branch into `main`, the repository owner verifies:
1. **Contract Compatibility:** Ensure frontend requests conform strictly to `@ai-workspace/shared` contracts.
2. **Build Verification:** Verify that both `apps/api` and `apps/web` compile cleanly without TypeScript errors:
   ```bash
   npm run build --workspaces
   ```
3. **No Direct Overwrites:** Confirm frontend PR does not touch or overwrite files in `apps/api/` or uncoordinated migrations.
4. **Merge Execution:**
   * Merge the PR on GitHub using **Squash and Merge** or **Create a Merge Commit**.
   * Rebase or pull `main` back into active working branches to keep them synchronized:
     ```bash
     git checkout frontend
     git merge main
     git push origin frontend
     ```

---

## 5. Commit Convention

We use standard Conventional Commits:
* `feat(web): ...` — New frontend feature
* `feat(api): ...` — New backend endpoint or service
* `feat(shared): ...` — Updates to shared contracts
* `fix(api): ...` — Bug fix in backend
* `docs: ...` — Documentation updates
* `refactor: ...` — Code refactoring without behavior changes
