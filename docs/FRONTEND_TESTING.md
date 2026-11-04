# Frontend Testing Plan

## 1. Testing Pyramid
1. **Unit Tests (Vitest + React Testing Library):**
   - Pure utilities (`formatters`, `date`, `token counters`).
   - Zod validation schemas (form inputs, parameter sanitizers).
   - Component rendering and state changes (Button states, Badge colors, Modal dismissals).
2. **Integration Tests:**
   - Multi-step form flows (AI Project Setup Wizard, Task Creation).
   - Context Inspector RAG citation rendering.
   - TanStack Query hook caching and refetching.
3. **End-to-End Tests (Playwright):**
   - User sign in -> Select Organization -> Enter Project Workspace.
   - Create task -> Drag-and-drop Kanban status change -> Verify optimistic update.
   - Open AI Workspace -> Prompt agent -> Verify streamed token reception and source citations.

---

## 2. Accessibility & Responsive Verification
- Keyboard navigation: Full `Tab`, `Arrow`, `Enter`, and `Escape` support across all modals, dropdowns, and drawers.
- WCAG 2.1 AA Contrast Ratios for all dark-theme text tokens.
- Responsive breakpoints: Mobile (`<640px`), Tablet (`640px - 1024px`), Desktop (`>1024px`).

