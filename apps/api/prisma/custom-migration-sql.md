# Custom PostgreSQL SQL for Initial Migration

> **What this file is:**
> Prisma generates SQL automatically from `schema.prisma`, but there are three database-level integrity
> rules that Prisma's declarative schema language cannot express. This file documents every raw SQL
> statement that must be **appended** to the initial migration file after `prisma migrate dev --create-only`
> produces it. The final migration file will be `prisma/migrations/<timestamp>_init/migration.sql`.
>
> **When to apply this:**
> Phase 2, Step 2c — after Supabase credentials are provided and the user approves running migrations.

---

## 1. Task Assignee → Same Project (Critical Cross-Tenant Guard)

### The Problem

`Task.assigneeMemberId` references `ProjectMember.id`. This proves the `ProjectMember` row **exists**,
but it does not prove it belongs to the **same project** as the task. Without this guard, a developer
could (intentionally or by bug) assign a Task in `project_id = A` to a `ProjectMember` whose
`project_id = B`.

### Why Not a Prisma Composite FK?

A composite FK `(projectId, assigneeMemberId) → ProjectMember(projectId, id)` would solve the
existence check, but Prisma's `onDelete: SetNull` on a composite FK nulls **ALL** FK columns
simultaneously. That would null out `task.project_id`, which is a required (NOT NULL) field, breaking
the task entirely. So composite FK with SET NULL is not safe here.

### Solution: PostgreSQL Trigger

A `BEFORE INSERT OR UPDATE` trigger that runs a check query. If the `assigneeMemberId`'s `project_id`
does not match the task's `project_id`, the trigger raises an exception and the write is aborted.

```sql
-- ============================================================
-- TRIGGER 1: Validate task assignee belongs to same project
-- ============================================================

-- Step 1: Create the trigger function.
-- A "trigger function" in PostgreSQL is a special PL/pgSQL function that
-- returns TRIGGER instead of a regular value. PostgreSQL calls it
-- automatically before the INSERT or UPDATE happens.
CREATE OR REPLACE FUNCTION validate_task_assignee_project()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run the check when assignee_member_id is being set (not NULL).
  IF NEW.assignee_member_id IS NOT NULL THEN
    -- Check: does this ProjectMember belong to the same project as the task?
    IF NOT EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.id = NEW.assignee_member_id
        AND pm.project_id = NEW.project_id
    ) THEN
      -- RAISE EXCEPTION aborts the INSERT/UPDATE and returns an error to
      -- the application, like a PostgreSQL-level constraint violation.
      RAISE EXCEPTION
        'Task assignee (project_member_id=%) does not belong to project (project_id=%). Cross-project assignment is forbidden.',
        NEW.assignee_member_id,
        NEW.project_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- NEW is the row being inserted/updated. Returning it allows the
  -- operation to proceed unchanged.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Attach the function to the tasks table.
-- BEFORE INSERT OR UPDATE means this check runs before the row is written.
-- FOR EACH ROW means it runs once per affected row (not once per statement).
CREATE TRIGGER trg_validate_task_assignee_project
  BEFORE INSERT OR UPDATE OF assignee_member_id ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION validate_task_assignee_project();
```

**Application-layer complement (TasksService):**
```typescript
// Before writing a task with an assignee, validate in service layer:
const member = await this.prisma.projectMember.findFirst({
  where: { id: assigneeMemberId, projectId: task.projectId },
});
if (!member) {
  throw new BadRequestException('Assignee is not a member of this project.');
}
```

---

## 2. Active Organization Membership Enforcement

### The Problem

`ProjectMember` has a composite FK `(organizationId, userId) → OrganizationMember(organizationId, userId)`.
This guarantees the `OrganizationMember` row exists — but `OrganizationMember.status` could be
`'SUSPENDED'` or `'INACTIVE'`. Prisma FK constraints cannot filter by column value; they only check
row existence.

### Why Not a Partial Unique Index?

A `UNIQUE INDEX ... WHERE status = 'ACTIVE'` helps with query optimization but cannot be targeted by
a FK. FKs can only reference columns that have a standard `UNIQUE` or `PRIMARY KEY` constraint.

### Solution: PostgreSQL Trigger

A `BEFORE INSERT` trigger on `project_members` that verifies the referenced `OrganizationMember` has
`status = 'ACTIVE'` before allowing the row to be inserted.

```sql
-- ============================================================
-- TRIGGER 2: Validate org member is ACTIVE before project membership
-- ============================================================

CREATE OR REPLACE FUNCTION validate_active_org_member_on_project_add()
RETURNS TRIGGER AS $$
DECLARE
  member_status VARCHAR(50);
BEGIN
  -- Look up the status of the OrganizationMember being referenced.
  SELECT status INTO member_status
  FROM organization_members
  WHERE organization_id = NEW.organization_id
    AND user_id = NEW.user_id;

  -- If the membership row doesn't exist or the status is not ACTIVE, reject.
  IF member_status IS NULL OR member_status != 'ACTIVE' THEN
    RAISE EXCEPTION
      'Cannot add user (user_id=%) to project: organization membership is not ACTIVE (current status: %).',
      NEW.user_id,
      COALESCE(member_status, 'NOT FOUND')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_active_org_member
  BEFORE INSERT ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_active_org_member_on_project_add();
```

**Application-layer complement (ProjectMembersService):**
```typescript
// Before adding a user to a project, validate org membership status:
const orgMember = await this.prisma.organizationMember.findUnique({
  where: { uq_org_member: { organizationId, userId } },
});
if (!orgMember || orgMember.status !== 'ACTIVE') {
  throw new ForbiddenException(
    'User must be an active organization member to join a project.',
  );
}
```

---

## 3. Role Integrity: System Role Consistency

### The Three Sub-Problems

1. **isSystemRole ↔ organizationId consistency:**
   The `roles` table allows `is_system_role = true` with `organization_id = 'some-uuid'` or
   `is_system_role = false` with `organization_id = NULL`. Both combinations are logically wrong.
   - System roles (`is_system_role = true`) must have `organization_id IS NULL`.
   - Custom roles (`is_system_role = false`) must have `organization_id IS NOT NULL`.

2. **System role name uniqueness:**
   The existing `@@unique([organizationId, name])` Prisma constraint maps to a standard PostgreSQL
   `UNIQUE (organization_id, name)`. When `organization_id IS NULL`, PostgreSQL standard behavior
   treats each NULL as distinct from other NULLs — meaning two rows with
   `(NULL, 'ADMIN')` and `(NULL, 'ADMIN')` would both pass the UNIQUE check. This creates duplicate
   system roles.

3. **Cross-org role assignment prevention:**
   An `OrganizationMember` must only be assigned a role that belongs to their organization, or a
   system role (where `organization_id IS NULL`). This cannot be enforced by FK alone (the FK only
   verifies the role exists).

### Solutions

```sql
-- ============================================================
-- CONSTRAINT 3a: Enforce isSystemRole ↔ organizationId consistency
-- ============================================================

-- A CHECK CONSTRAINT runs every time a row is inserted or updated.
-- If the condition evaluates to FALSE, the write is rejected.
-- Translation of the rule:
--   "Either: (it's a system role AND org is null) OR (it's a custom role AND org is set)"
ALTER TABLE roles
  ADD CONSTRAINT chk_role_system_consistency
  CHECK (
    (is_system_role = TRUE  AND organization_id IS NULL) OR
    (is_system_role = FALSE AND organization_id IS NOT NULL)
  );

-- ============================================================
-- CONSTRAINT 3b: Unique system role names globally
-- ============================================================

-- A PARTIAL UNIQUE INDEX only indexes rows where the WHERE condition is true.
-- For system roles (organization_id IS NULL), this guarantees that no two
-- system roles can share the same name. For custom roles (organization_id IS NOT NULL),
-- uniqueness is already handled by the standard @@unique([organizationId, name]).
CREATE UNIQUE INDEX idx_system_role_unique_name
  ON roles (name)
  WHERE organization_id IS NULL;

-- ============================================================
-- CONSTRAINT 3c: Prevent cross-org role assignment (application-layer)
-- ============================================================
-- Database-level enforcement via trigger is planned for future hardening.
-- For now, the application layer validates this in OrganizationMembersService:
--
-- const role = await this.prisma.role.findUnique({ where: { id: roleId } });
-- if (!role) throw new NotFoundException('Role not found.');
-- if (!role.isSystemRole && role.organizationId !== member.organizationId) {
--   throw new ForbiddenException(
--     'Cannot assign a role belonging to a different organization.',
--   );
-- }
```

---

## 4. Supabase Auth → Profile Synchronization Trigger

### The Problem

`Profile.id` has no `@default(uuid())` — it must exactly match `auth.users.id` from Supabase's
internal auth schema. Without a trigger, every user registration would require a separate API call to
create the profile row. If that call fails, the auth user and profile rows become out of sync.

### Solution: Supabase Database Trigger (run in Supabase SQL Editor)

> **Note:** This trigger runs in the Supabase `auth` schema, not the `public` schema.
> It must be created via the **Supabase SQL Editor** (Dashboard → SQL Editor),
> NOT via `prisma migrate`, because Prisma does not manage the `auth` schema.

```sql
-- ============================================================
-- SUPABASE TRIGGER: Auto-create profile on user registration
-- ============================================================

-- This function is called whenever a new user is inserted into auth.users.
-- It inserts a matching row into our public.profiles table using the same UUID.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, display_name, avatar_url, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL),
    'ACTIVE'
  )
  ON CONFLICT (id) DO NOTHING; -- Safe: idempotent if trigger fires twice
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to auth.users AFTER INSERT
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## 5. Applying This SQL

When we run `prisma migrate dev --create-only` in Phase 2, Step 2c, Prisma will create a file at:

```
apps/api/prisma/migrations/<timestamp>_init/migration.sql
```

**Before running `prisma migrate dev` (without `--create-only`)**, append all Section 1–3 SQL blocks
to the bottom of that file. Then run:

```bash
npx prisma migrate dev --schema=./apps/api/prisma/schema.prisma
```

The Supabase trigger (Section 4) must be run separately in the Supabase SQL Editor after the
migration succeeds.

---

## 6. Summary Table

| # | Issue | Enforcement Layer | Mechanism |
|---|---|---|---|
| 1 | Task assignee must belong to task's project | Database (trigger) + Application | `trg_validate_task_assignee_project` trigger + service check |
| 2 | Org member must be ACTIVE to join a project | Database (trigger) + Application | `trg_validate_active_org_member` trigger + service check |
| 3a | System roles must have `organizationId = NULL` | Database (CHECK constraint) | `chk_role_system_consistency` |
| 3b | System role names must be globally unique | Database (partial index) | `idx_system_role_unique_name` |
| 3c | Custom roles cannot be assigned cross-org | Application | Service validation in `OrganizationMembersService` |
| 4 | Profile auto-created when Supabase user registers | Database (Supabase trigger) | `on_auth_user_created` trigger in Supabase SQL Editor |
