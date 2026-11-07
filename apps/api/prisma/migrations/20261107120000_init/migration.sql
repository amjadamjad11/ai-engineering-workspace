BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('PLANNING', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "project_role" AS ENUM ('LEAD', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "org_member_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "display_name" VARCHAR(100),
    "avatar_url" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "logo_url" TEXT,
    "billing_plan" VARCHAR(50) NOT NULL DEFAULT 'FREE',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_system_role" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "org_member_status" NOT NULL DEFAULT 'INVITED',
    "joined_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'PLANNING',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_role" "project_role" NOT NULL DEFAULT 'CONTRIBUTOR',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_number" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "assignee_member_id" UUID,
    "created_by_id" UUID,
    "estimated_hours" DECIMAL(6,2),
    "due_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID,
    "content" TEXT NOT NULL,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "idx_profiles_status" ON "profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_orgs_deleted_at" ON "organizations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_name_key" ON "roles"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "idx_org_members_user_id" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_org_members_org_status" ON "organization_members"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_projects_org_status" ON "projects"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_organization_id_key" ON "projects"("id", "organization_id");

-- CreateIndex
CREATE INDEX "idx_proj_members_user_proj" ON "project_members"("user_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_tasks_project_status" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "idx_tasks_assignee_member" ON "tasks"("assignee_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_task_number_key" ON "tasks"("project_id", "task_number");

-- CreateIndex
CREATE INDEX "idx_task_comments_task_created" ON "task_comments"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "organization_members"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_member_id_fkey" FOREIGN KEY ("assignee_member_id") REFERENCES "project_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- ============================================================================
-- 5. Row Level Security (RLS) & Defense-in-Depth Privilege Hardening
-- ============================================================================
-- Enable Row Level Security on all 10 public tables.
-- In accordance with security architecture, direct PostgREST / client SDK access
-- defaults to DENY ALL because no permissive policies are created.
-- FORCE ROW LEVEL SECURITY is intentionally omitted so the Prisma database owner
-- connection can read/write without restriction.
-- NestJS tenant guards (OrgTenantGuard, ProjectTenantGuard) remain mandatory for
-- authenticated application-tier authorization.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Revoke direct table privileges from PUBLIC, anon, and authenticated roles as defense-in-depth:
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.project_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.task_comments FROM PUBLIC, anon, authenticated;

-- Revoke execute permissions on custom trigger functions from PUBLIC, anon, and authenticated:
REVOKE EXECUTE ON FUNCTION public.prevent_role_ownership_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_member_role_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_active_org_member_on_project_add() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_project_member_identity_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_task_assignee_project() FROM PUBLIC, anon, authenticated;

COMMIT;
