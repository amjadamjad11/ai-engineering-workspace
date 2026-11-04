# Frontend TODO & Backlog

## Phase 1 — Foundation & Monorepo Alignment
- [x] Audit workspace structure and alignment with Amjad's NestJS backend
- [x] Configure git branch `feature/frontend`
- [x] Establish frontend documentation suite (`FRONTEND_STATUS.md`, `FRONTEND_DESIGN_SYSTEM.md`, etc.)
- [ ] Initialize Next.js 15 App Router in `apps/web`
- [ ] Configure Tailwind CSS with dark-first color tokens
- [ ] Configure `tsconfig.json` with strict mode and path aliases (`@/*` -> `apps/web/src/*`)
- [ ] Install and configure core libraries (`lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@tanstack/react-query`)
- [ ] Set up basic health-check page & layout shell

## Phase 2 — Design System & Reusable Components
- [ ] Build core `shadcn/ui` primitives (Button, Card, Input, Dialog, Dropdown, Tabs, Badge, Avatar, Skeleton)
- [ ] Build App Navigation Shell (Collapsible Sidebar, Organization Switcher, Breadcrumbs, User Profile)
- [ ] Build Empty States, Error Boundaries, and Loading States
- [ ] Build Markdown & Syntax Highlighting component with copy button

## Phase 3 — Authentication & Organization UI
- [ ] Login screen with Zod validation
- [ ] Register screen
- [ ] Forgot password & reset flows
- [ ] Organization selection & creation modal
- [ ] Team members & invite UI
