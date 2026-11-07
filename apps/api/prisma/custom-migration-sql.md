# Production-Hardened Custom PostgreSQL SQL for Initial Migration

> **File Purpose:**
> Prisma manages declarative tables, enums, standard foreign keys, and indexes defined in `schema.prisma`.
> However, multi-tenant database invariants—such as concurrency-safe cross-table row checks, conditional
> partial indexes over NULLable columns, immutable role ownership, and lifecycle status gates—cannot be
> expressed within standard Prisma schema syntax.
>
> This document provides the complete, production-hardened raw SQL definitions to be appended to the
> initial Prisma migration file (`apps/api/prisma/migrations/<timestamp>_init/migration.sql`)
> before applying it to Supabase PostgreSQL.
>
> **Status:** Review specification only. No migration has been generated or applied yet.

---

## 1. Task Assignment Concurrency & ProjectMember Identity Immutability

### 1.1 The Vulnerabilities
1. **Cross-Project Task Assignment:**
   `Task.assigneeMemberId` references `ProjectMember.id`. A basic single-column foreign key ensures that the
   referenced `project_members` row exists, but cannot check that `project_members.project_id` equals `tasks.project_id`.
   Furthermore, an ordinary `EXISTS (...)` query runs without locking the referenced row, creating race conditions under concurrent updates.
2. **ProjectMember Identity Swapping (Historical Integrity Violation):**
   `Task.assigneeMemberId` points to `ProjectMember.id`. If an existing `project_members` row could have its `user_id`,
   `project_id`, or `organization_id` updated, every existing task assignment, comment, or audit record pointing to that
   membership ID would silently and retroactively transfer to a completely different human or project.
   Therefore, the compound identity tuple `(id, project_id, organization_id, user_id)` of an existing `ProjectMember`
   must be **strictly immutable**. Legitimate operational changes—such as updating a member's `projectRole` (`LEAD`, `CONTRIBUTOR`, `VIEWER`)—remain fully permitted.

### 1.2 Locking & Immutability Strategy
- **`FOR SHARE` Locking during Assignment:** When a task assignee is inserted or updated, the trigger executes
  `SELECT project_id INTO v_member_project_id FROM public.project_members WHERE id = NEW.assignee_member_id FOR SHARE`.
  A `FOR SHARE` lock guarantees that concurrent transactions cannot modify or delete that `project_members` row
  until the task assignment transaction completes.
- **Membership Identity Immutability:** Once a `ProjectMember` record is created, its identity columns (`project_id`,
  `organization_id`, `user_id`) must never be modified. We enforce this with `trg_prevent_project_member_identity_mutation`
  using `IS DISTINCT FROM` comparisons (which handle NULL values safely). If a user leaves or changes roles across projects,
  the membership must be removed and a new membership created.
- **Safe Deletion Cascade:** `Task.assigneeMemberId` uses `ON DELETE SET NULL`. If a `ProjectMember` is deleted,
  PostgreSQL natively sets `assignee_member_id` to `NULL` without modifying the required `project_id` column.

### 1.3 SQL Implementation

```sql
-- ============================================================================
-- 1a. TRIGGER: Validate task assignee belongs to the exact same project
-- Locks referenced project_member row with FOR SHARE to prevent race conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_task_assignee_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_project_id UUID;
BEGIN
  IF NEW.assignee_member_id IS NOT NULL THEN
    SELECT project_id
    INTO v_member_project_id
    FROM public.project_members
    WHERE id = NEW.assignee_member_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Data integrity violation: Task assignee (project_member_id=%) does not exist.',
        NEW.assignee_member_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_member_project_id != NEW.project_id THEN
      RAISE EXCEPTION
        'Data integrity violation: Task assignee (project_member_id=%) belongs to project (%), not the task project (%). Cross-project assignment is rejected.',
        NEW.assignee_member_id,
        v_member_project_id,
        NEW.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_assignee_project ON public.tasks;

CREATE TRIGGER trg_validate_task_assignee_project
  BEFORE INSERT OR UPDATE OF assignee_member_id, project_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_assignee_project();


-- ============================================================================
-- 1b. TRIGGER: Prevent identity mutation on existing project_members
-- Ensures project_id, organization_id, and user_id are strictly immutable.
-- Non-identity fields (such as project_role) remain fully mutable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_project_member_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify project_id on project membership (id=%). Identity fields are immutable. Remove the member and create a new project membership instead.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify organization_id on project membership (id=%). Identity fields are immutable. Remove the member and create a new project membership instead.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify user_id on project membership (id=%). Identity fields are immutable. Changing the user of an existing membership corrupts historical task assignments.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_project_member_project_mutation ON public.project_members;
DROP TRIGGER IF EXISTS trg_prevent_project_member_identity_mutation ON public.project_members;

CREATE TRIGGER trg_prevent_project_member_identity_mutation
  BEFORE UPDATE OF project_id, organization_id, user_id ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_project_member_identity_mutation();
```

---

## 2. Organization Membership Lifecycle & Concurrency

### 2.1 The Vulnerability & Intended Lifecycle
1. **Invitation & Membership State Model:**
   In our domain model (`packages/shared/src/contracts/organization.contract.ts`), sending an invitation creates an `OrganizationMember` record in `status = 'INVITED'`.
   - `status` defaults to `INVITED`.
   - `joinedAt` is `NULL` initially.
   - When the invited user accepts the invitation, the backend explicitly updates `status` to `ACTIVE` and sets `joinedAt = NOW()`.
   - Creating the organization owner creates an immediate `status = 'ACTIVE'` membership with `joinedAt = NOW()`.
2. **Concurrency on Project Assignment:**
   A foreign key constraint only verifies row existence—it cannot evaluate whether `status = 'ACTIVE'`.
   If an application attempts to add an organization member to a project while an administrator is concurrently
   updating that member's status to `SUSPENDED` or `INACTIVE`, an ordinary non-locking query can read stale
   status data before the suspension transaction commits.

### 2.2 Locking & Historical Record Preservation
- **`FOR SHARE` Locking on `organization_members`:**
  During project membership insertion (`BEFORE INSERT OR UPDATE OF organization_id, user_id`), the trigger runs:
  `SELECT status INTO v_status FROM public.organization_members WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id FOR SHARE`.
  This shared lock blocks or serializes any concurrent transaction attempting to change `organization_members.status`.
- **Preservation of History on Suspension:**
  When an organization member is transitioned to `SUSPENDED` or `INACTIVE`, their existing `project_members`
  rows **must remain intact**. Hard deleting them would corrupt audit trails, task assignments, and commit records.
- **Application Security Boundary Note:**
  Database triggers execute only on table write operations (`INSERT`, `UPDATE`, `DELETE`). They do not intercept
  incoming HTTP `GET` requests. Therefore, immediate access denial for suspended users must be enforced by
  application-level guards (`OrgTenantGuard`, `ProjectAccessGuard`) which query `status === 'ACTIVE'` on every request.
  *(Note: These NestJS guards are scheduled for Phase 3 and Phase 4 implementation and are not yet in the codebase).*

### 2.3 SQL Implementation

```sql
-- ============================================================================
-- 2. TRIGGER: Validate organization member is ACTIVE before project membership
-- Locks referenced organization_member row with FOR SHARE to prevent race conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_active_org_member_on_project_add()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.org_member_status;
BEGIN
  SELECT status
  INTO v_status
  FROM public.organization_members
  WHERE organization_id = NEW.organization_id
    AND user_id = NEW.user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cannot add user (user_id=%) to project: User is not a member of organization (org_id=%).',
      NEW.user_id,
      NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status != 'ACTIVE'::public.org_member_status THEN
    RAISE EXCEPTION
      'Cannot add user (user_id=%) to project: Organization membership is not ACTIVE (current status: %). Only ACTIVE members can join projects.',
      NEW.user_id,
      v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_active_org_member ON public.project_members;

CREATE TRIGGER trg_validate_active_org_member
  BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_active_org_member_on_project_add();
```

---

## 3. Role Integrity, Immutability & Cross-Tenant Boundary

### 3.1 The Vulnerabilities
1. **System vs. Custom Role Consistency:**
   - System roles are platform-wide templates and must have `organization_id IS NULL` and `is_system_role = TRUE`.
   - Custom roles belong to one organization and must have `organization_id IS NOT NULL` and `is_system_role = FALSE`.
2. **Global System Role Name Uniqueness:**
   - Standard PostgreSQL `UNIQUE (organization_id, name)` does not prevent duplicate system roles because `NULL != NULL`.
   - A partial unique index `WHERE organization_id IS NULL` is required.
3. **Role Ownership Immutability:**
   - Once a custom role is created, its `organization_id` must never be altered to transfer it to another organization.
   - A role's `is_system_role` flag must never be changed after creation.
   - If role ownership could change, existing `organization_members` assigned to that role would instantly violate tenant isolation.
4. **Cross-Tenant Role Assignment Prevention with Locking:**
   - When assigning a role to an `OrganizationMember`, the role row must be locked with `FOR SHARE` to prevent concurrent modifications.

### 3.2 SQL Implementation

```sql
-- ============================================================================
-- 3a. CHECK CONSTRAINT: Enforce is_system_role <-> organization_id consistency
-- ============================================================================

ALTER TABLE public.roles
  DROP CONSTRAINT IF EXISTS chk_role_system_consistency;

ALTER TABLE public.roles
  ADD CONSTRAINT chk_role_system_consistency
  CHECK (
    (is_system_role = TRUE  AND organization_id IS NULL) OR
    (is_system_role = FALSE AND organization_id IS NOT NULL)
  );


-- ============================================================================
-- 3b. PARTIAL UNIQUE INDEX: System role names must be globally unique
-- ============================================================================

DROP INDEX IF EXISTS public.idx_system_role_unique_name;

CREATE UNIQUE INDEX idx_system_role_unique_name
  ON public.roles (name)
  WHERE organization_id IS NULL;


-- ============================================================================
-- 3c. TRIGGER: Role ownership & system classification immutability
-- Custom role organization_id and is_system_role cannot be altered after creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_role_ownership_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system_role != NEW.is_system_role THEN
    RAISE EXCEPTION
      'Integrity violation: Role classification is immutable. Cannot change is_system_role for role (id=%).',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'Integrity violation: Role organization ownership is immutable. Cannot transfer role (id=%) from organization (%) to organization (%).',
      OLD.id,
      OLD.organization_id,
      NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_ownership_mutation ON public.roles;

CREATE TRIGGER trg_prevent_role_ownership_mutation
  BEFORE UPDATE OF organization_id, is_system_role ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_ownership_mutation();


-- ============================================================================
-- 3d. TRIGGER: Prevent cross-tenant role assignment with FOR SHARE locking
-- Fires on organization_members INSERT or UPDATE of role_id, organization_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_member_role_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_org_id UUID;
  v_is_system BOOLEAN;
BEGIN
  SELECT organization_id, is_system_role
  INTO v_role_org_id, v_is_system
  FROM public.roles
  WHERE id = NEW.role_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Assigned role (role_id=%) does not exist.',
      NEW.role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT v_is_system AND (v_role_org_id IS NULL OR v_role_org_id != NEW.organization_id) THEN
    RAISE EXCEPTION
      'Security boundary violation: Cannot assign custom role (role_id=%, role_org_id=%) to member of organization (member_org_id=%). Custom roles can only be assigned within their own organization.',
      NEW.role_id,
      v_role_org_id,
      NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_member_role_org ON public.organization_members;

CREATE TRIGGER trg_validate_member_role_org
  BEFORE INSERT OR UPDATE OF role_id, organization_id ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_member_role_organization();
```

---

## 4. Production-Hardened Supabase Profile Synchronization

### 4.1 SQL Syntax & `SET search_path = ''` Corrections
In PostgreSQL, `COALESCE()` and `NULLIF()` are standard SQL conditional expressions, not schema-bound functions in `pg_catalog`. Attempting to invoke them as `pg_catalog.coalesce()` or `pg_catalog.nullif()` will fail.
Similarly, SQL standard `TRIM(...)` is implemented internally by PostgreSQL as `pg_catalog.btrim(text)`. Under `SET search_path = ''`, invoking `pg_catalog.trim(...)` fails because the function name is `btrim`.
We use:
- SQL language construct `COALESCE(...)`
- SQL language construct `NULLIF(...)`
- Schema-qualified function `pg_catalog.btrim(...)`

### 4.2 Security Principles of `SECURITY DEFINER`
A PostgreSQL function declared with `SECURITY DEFINER` executes with the privileges of the **role that owns the function**, rather than the role of the client calling it.
- In Supabase, the function creator in the SQL Editor or database migration is typically `postgres` (or a designated database administrative role).
- **The Security Risk:** If an untrusted user can invoke a `SECURITY DEFINER` function that does not secure its environment, they could execute code with the function owner's elevated privileges. Specifically, if `search_path` is left default or mutable, an attacker could create malicious objects in a schema that precedes `public` in the resolution order, hijacking function calls.
- **The Defense:** We specify `SECURITY DEFINER SET search_path = ''`. Setting an empty search path forces PostgreSQL to look in no schema implicitly. Every table, function, operator, and type must be explicitly schema-qualified (e.g. `public.profiles`, `public.user_status`, `pg_catalog.btrim`, `pg_catalog.now`). This completely neutralizes search-path hijacking attacks.

### 4.3 Handling Missing or Whitespace-Only Data
- **No silent failures:** `Profile.email` and `Profile.id` are required (`NOT NULL`) in our domain model. If Supabase Auth receives a registration with a missing or null email or id, the trigger must reject the operation with `RAISE EXCEPTION`. It must not silently return `NEW`, which would result in an auth user without a profile.
- **Sanitizing whitespace-only names:** If `full_name` in metadata consists only of whitespace (`'   '`), trimming it with `pg_catalog.btrim()` yields `''`. The trigger detects empty strings after trimming and falls back to extracting the username prefix from the email.
- **Length bounding:** Values are bounded using `pg_catalog.substring` to match the `@db.VarChar(150)` and `@db.VarChar(100)` limits.

### 4.4 Deployment Architecture Choice: Dedicated Management via Supabase SQL Editor
While Prisma custom SQL migrations *can* technically execute arbitrary DDL including triggers on external schemas (provided the database user has sufficient `GRANT` permissions on `auth.users`), we deliberately choose to manage the Supabase Auth trigger separately in the Supabase SQL Editor:
1. **Separation of Concerns:** `schema.prisma` models our application domain in the `public` schema. The `auth` schema is internally managed by Supabase and GoTrue. Keeping their migration lifecycles separated prevents local Prisma drift detection from attempting to manage or diff Supabase internals.
2. **Permission Boundary:** In production Supabase instances, connection pooler credentials used for application migrations often operate under restricted roles that may lack `SUPERUSER` or direct `ALTER TABLE` privileges on `auth.users`.
3. **Execution Location:** This trigger is executed once via the **Supabase Dashboard SQL Editor** after public table creation.

```sql
-- ============================================================================
-- 4. SUPABASE AUTH TRIGGER: Secure profile synchronization
-- Executes in Supabase SQL Editor (handles auth.users -> public.profiles)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_full_name TEXT;
  v_full_name VARCHAR(150);
  v_raw_display_name TEXT;
  v_display_name VARCHAR(100);
  v_avatar_url TEXT;
  v_email VARCHAR(255);
BEGIN
  -- 1. Validate required fields
  IF NEW.id IS NULL THEN
    RAISE EXCEPTION 'Cannot synchronize profile: auth.users.id is NULL.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF NEW.email IS NULL OR pg_catalog.btrim(NEW.email) = '' THEN
    RAISE EXCEPTION 'Cannot synchronize profile: auth.users.email is required and cannot be empty.'
      USING ERRCODE = 'not_null_violation';
  END IF;

  v_email := pg_catalog.lower(pg_catalog.btrim(NEW.email));

  -- 2. Extract and sanitize full_name
  -- Fallback order: metadata.full_name -> metadata.name -> email prefix
  v_raw_full_name := pg_catalog.btrim(
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    )
  );

  IF v_raw_full_name = '' THEN
    -- If no name or whitespace-only name was provided, derive from email prefix
    v_raw_full_name := pg_catalog.btrim(pg_catalog.split_part(v_email, '@', 1));
  END IF;

  v_full_name := pg_catalog.substring(v_raw_full_name FROM 1 FOR 150);

  -- 3. Extract and sanitize display_name (optional)
  v_raw_display_name := pg_catalog.btrim(
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );

  IF v_raw_display_name = '' THEN
    v_display_name := NULL;
  ELSE
    v_display_name := pg_catalog.substring(v_raw_display_name FROM 1 FOR 100);
  END IF;

  -- 4. Extract avatar_url (optional)
  v_avatar_url := NULLIF(
    pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')),
    ''
  );

  -- 5. Insert profile record with idempotent upsert
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    display_name,
    avatar_url,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_display_name,
    v_avatar_url,
    'ACTIVE'::public.user_status,
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN public.profiles.full_name IS NULL OR pg_catalog.btrim(public.profiles.full_name) = ''
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## 5. Consolidated SQL Block for Initial Migration File

When preparing the initial migration file, append the following complete, reviewable block:

```sql
-- ============================================================================
-- AI ENGINEERING WORKSPACE — CUSTOM DATABASE INTEGRITY & SECURITY EXTENSIONS
-- Appended to initial Prisma migration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Roles: System vs Custom Role Consistency & Immutability
-- ----------------------------------------------------------------------------
ALTER TABLE public.roles
  DROP CONSTRAINT IF EXISTS chk_role_system_consistency;

ALTER TABLE public.roles
  ADD CONSTRAINT chk_role_system_consistency
  CHECK (
    (is_system_role = TRUE  AND organization_id IS NULL) OR
    (is_system_role = FALSE AND organization_id IS NOT NULL)
  );

DROP INDEX IF EXISTS public.idx_system_role_unique_name;

CREATE UNIQUE INDEX idx_system_role_unique_name
  ON public.roles (name)
  WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_role_ownership_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system_role != NEW.is_system_role THEN
    RAISE EXCEPTION
      'Integrity violation: Role classification is immutable. Cannot change is_system_role for role (id=%).',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'Integrity violation: Role organization ownership is immutable. Cannot transfer role (id=%) from organization (%) to organization (%).',
      OLD.id,
      OLD.organization_id,
      NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_ownership_mutation ON public.roles;

CREATE TRIGGER trg_prevent_role_ownership_mutation
  BEFORE UPDATE OF organization_id, is_system_role ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_ownership_mutation();

-- ----------------------------------------------------------------------------
-- 2. Organization Members: Role Tenant Boundary with FOR SHARE Row Lock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_member_role_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_org_id UUID;
  v_is_system BOOLEAN;
BEGIN
  SELECT organization_id, is_system_role
  INTO v_role_org_id, v_is_system
  FROM public.roles
  WHERE id = NEW.role_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Assigned role (role_id=%) does not exist.',
      NEW.role_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT v_is_system AND (v_role_org_id IS NULL OR v_role_org_id != NEW.organization_id) THEN
    RAISE EXCEPTION
      'Security boundary violation: Cannot assign custom role (role_id=%, role_org_id=%) to member of organization (member_org_id=%). Custom roles can only be assigned within their own organization.',
      NEW.role_id,
      v_role_org_id,
      NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_member_role_org ON public.organization_members;

CREATE TRIGGER trg_validate_member_role_org
  BEFORE INSERT OR UPDATE OF role_id, organization_id ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_member_role_organization();

-- ----------------------------------------------------------------------------
-- 3. Project Members: Active Status Validation & Identity Immutability
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_active_org_member_on_project_add()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.org_member_status;
BEGIN
  SELECT status
  INTO v_status
  FROM public.organization_members
  WHERE organization_id = NEW.organization_id
    AND user_id = NEW.user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cannot add user (user_id=%) to project: User is not a member of organization (org_id=%).',
      NEW.user_id,
      NEW.organization_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status != 'ACTIVE'::public.org_member_status THEN
    RAISE EXCEPTION
      'Cannot add user (user_id=%) to project: Organization membership is not ACTIVE (current status: %). Only ACTIVE members can join projects.',
      NEW.user_id,
      v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_active_org_member ON public.project_members;

CREATE TRIGGER trg_validate_active_org_member
  BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_active_org_member_on_project_add();

CREATE OR REPLACE FUNCTION public.prevent_project_member_identity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify project_id on project membership (id=%). Identity fields are immutable. Remove the member and create a new project membership instead.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify organization_id on project membership (id=%). Identity fields are immutable. Remove the member and create a new project membership instead.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION
      'Integrity violation: Cannot modify user_id on project membership (id=%). Identity fields are immutable. Changing the user of an existing membership corrupts historical task assignments.',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_project_member_project_mutation ON public.project_members;
DROP TRIGGER IF EXISTS trg_prevent_project_member_identity_mutation ON public.project_members;

CREATE TRIGGER trg_prevent_project_member_identity_mutation
  BEFORE UPDATE OF project_id, organization_id, user_id ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_project_member_identity_mutation();

-- ----------------------------------------------------------------------------
-- 4. Tasks: Assignee Project Integrity with FOR SHARE Row Lock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_task_assignee_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_project_id UUID;
BEGIN
  IF NEW.assignee_member_id IS NOT NULL THEN
    SELECT project_id
    INTO v_member_project_id
    FROM public.project_members
    WHERE id = NEW.assignee_member_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Data integrity violation: Task assignee (project_member_id=%) does not exist.',
        NEW.assignee_member_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_member_project_id != NEW.project_id THEN
      RAISE EXCEPTION
        'Data integrity violation: Task assignee (project_member_id=%) belongs to project (%), not the task project (%). Cross-project assignment is rejected.',
        NEW.assignee_member_id,
        v_member_project_id,
        NEW.project_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_assignee_project ON public.tasks;

CREATE TRIGGER trg_validate_task_assignee_project
  BEFORE INSERT OR UPDATE OF assignee_member_id, project_id ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_assignee_project();
```

---

## 6. Migration Lifecycle & Prisma Migration Engine Architecture

Understanding the mechanics of Prisma CLI commands is critical before executing any database changes.

### 6.1 Shadow Database Requirements in `prisma migrate dev` (Including `--create-only`)
A common misconception is that adding `--create-only` bypasses the target database or shadow database. **It does not.**
Even when invoked with `--create-only`:
1. Prisma connects to the target development database (`directUrl`) to inspect applied migration records in `_prisma_migrations` and detect schema drift.
2. Prisma connects to a **Shadow Database** and executes all historical migrations plus the current `schema.prisma` definition to synthesize the new SQL diff.
3. Therefore, `prisma migrate dev --create-only` is **never safe to run against a production database**, as it requires an active development environment with schema modification and shadow database privileges.

### 6.2 The Cloud Pooler Conflict & Development Shadow DB
When using Supabase:
1. **The Conflict with Connection Poolers:**
   - **Transaction Pooler (Port 6543):** Does not support prepared statements or administrative session-level DDL. Running any migration command through port 6543 fails immediately.
   - **Session Pooler (Port 5432 / 6432 via pooler host):** Connects with session semantics, but pooler proxy users typically lack the PostgreSQL `CREATEDB` privilege required to dynamically create `prisma_migrate_shadow_db_<uuid>`.
2. **Configuring a Dedicated Shadow Database for Development:**
   To generate migrations using `prisma migrate dev` when connected to Supabase without direct superuser privileges:
   - Provide a separate physical database URL in `prisma/schema.prisma` or via environment variable:
     ```prisma
     datasource db {
       provider          = "postgresql"
       url               = env("DATABASE_URL")
       directUrl         = env("DIRECT_URL")
       shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
     }
     ```
   - In local development, `SHADOW_DATABASE_URL` can point to a secondary database on a local PostgreSQL instance (e.g. `postgresql://postgres:postgres@localhost:5432/ai_workspace_shadow`), or a dedicated development shadow database in Supabase.

### 6.3 Development vs. Production Migration Workflows

| Stage | Command | What It Does | Shadow DB Required? | Safe for Remote Production? |
| :--- | :--- | :--- | :--- | :--- |
| **Drafting (Development)** | `prisma migrate dev --create-only --name <name>` | Synthesizes schema diff using shadow DB and target dev DB, writes raw SQL to `prisma/migrations/`, but **does not execute new migration**. | **Yes** (Prisma must compute the diff). | **NO.** Requires dev/staging target and shadow DB. |
| **Local Application (Development)** | `prisma migrate dev` | Evaluates shadow DB, applies unapplied migrations, calculates checksums, and updates `_prisma_migrations`. | **Yes.** | **NO.** Intended strictly for local/development environments. |
| **Deployment (Production / CI)** | `prisma migrate deploy` | Reads checked-in migration files in `prisma/migrations/`, verifies checksums, and applies unapplied migrations in order. | **NO.** Never needs shadow DB. Never prompts. | **Yes.** This is the official, deterministic command for applying migrations to production. |

### 6.4 The Safe Step 2c Migration Protocol
1. **Never apply a migration blindly.**
2. When creating the initial migration:
   - Ensure `DIRECT_URL` (direct connection or session pooler with DDL rights) and, if required, `SHADOW_DATABASE_URL` are configured.
   - Run `npx prisma migrate dev --create-only --name init` in the development environment.
3. Inspect the generated `migration.sql` file.
4. Append the verified SQL block from Section 5.
5. Review the final combined migration file.
6. Apply deterministically using `npx prisma migrate deploy` (or `migrate dev` with explicit review).
7. Apply the Supabase Auth trigger via the Supabase Dashboard SQL Editor (Section 4.4).
