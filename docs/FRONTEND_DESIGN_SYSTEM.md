# Frontend Design System Specification

## 1. Visual Identity & Aesthetic Direction
- **Theme:** Dark-First High-Density Engineering Workspace. Inspired by the best developer experiences in Linear, Cursor, and Raycast.
- **Surface Elevation System:**
  - Background Base: `#08090d` (pure canvas)
  - Card / Panel Surface: `#0f1219` (elevated)
  - Subsurface / Inner Well: `#151922` (inputs, nested lists)
  - Border Subtle: `#1e2433` (subtle separation)
  - Border Strong: `#2d374d` (hover, active focus)
- **Primary Accents:**
  - Violet: `#8b5cf6` (Linear purple for active selections, primary CTAs)
  - Indigo / Electric Blue: `#6366f1` (secondary indicators, active links)
  - Cyan: `#06b6d4` (AI agent thinking indicator, RAG citations)
  - Emerald: `#10b981` (approved records, success states)
  - Amber: `#f59e0b` (in review, draft status)
  - Rose: `#f43f5e` (blocked tasks, errors)

---

## 2. Typography Scale
- Primary Font: Inter / Geist Sans (Interface)
- Monospace Font: JetBrains Mono / Geist Mono (Code, API signatures, diffs)
- Headings:
  - `h1`: 24px (1.5rem), font-semibold, tracking-tight
  - `h2`: 20px (1.25rem), font-semibold, tracking-tight
  - `h3`: 16px (1rem), font-medium
- Body:
  - `body-default`: 14px (0.875rem), font-normal, line-height 1.5
  - `body-small`: 12px (0.75rem), text-muted-foreground
  - `code`: 12px / 13px, font-mono

---

## 3. UI Component Primitives (shadcn/ui + Radix)
1. **Buttons:** Primary (solid violet), Secondary (ghost with border), Destructive, Icon-only.
2. **Badges:** Role badges (`Frontend`, `Backend`, `QA`, `Lead`), Status badges (`Approved`, `Draft`, `Deprecated`).
3. **Data Display:**
   - Markdown viewer with syntax-highlighted code blocks and instant 1-click copy.
   - Diff viewers for AI suggestions before human approval.
   - Skeletons with subtle pulse for zero content layout shifts (CLS).
4. **Interactive Controls:**
   - Command palette (`Cmd+K` / `Ctrl+K`) for workspace-wide quick navigation.
   - Context Inspector slide-over drawer for RAG references.
