import { PrismaClient } from '@prisma/client';
import {
  PermissionCode,
  PERMISSION_DEFINITIONS,
} from '@ai-workspace/shared';

/**
 * Stable 64-bit integer advisory lock key reserved for RBAC seed operations.
 * Hash/numeric representation of 'rbac_seed_lock'.
 */
export const RBAC_SEED_ADVISORY_LOCK_KEY = 8294719371059281n;

export const CANONICAL_SYSTEM_ROLES = [
  {
    name: 'OWNER',
    description: 'Organization Owner with complete administrative and governance control.',
  },
  {
    name: 'ADMIN',
    description: 'Organization Administrator with broad project and team management access.',
  },
  {
    name: 'MEMBER',
    description: 'Standard Organization Member with access governed by project-level memberships.',
  },
] as const;

export interface SeedResult {
  readonly rolesUpserted: number;
  readonly permissionsUpserted: number;
  readonly mappingsSynchronized: number;
}

/**
 * Safe, transactional, idempotent RBAC seed procedure.
 * Accepts any Prisma-compatible transaction client or PrismaClient instance.
 *
 * Safety guarantees:
 * 1. Transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock`) prevents race conditions.
 * 2. Parameterized SQL with partial index conflict target (`idx_system_role_unique_name`) upserts system roles safely without mutating ownership fields.
 * 3. Exact assertion of 3 canonical roles and 2 permissions before modifying mappings.
 * 4. Mappings deletion is strictly bounded to the 3 resolved canonical system role IDs (`OWNER`, `ADMIN`, `MEMBER`).
 * 5. Custom organization roles and non-canonical system roles are NEVER modified or deleted.
 */
export async function seedRbac(prisma: PrismaClient): Promise<SeedResult> {
  return await prisma.$transaction(
    async (tx) => {
      // 1. Acquire transaction-scoped advisory lock to serialize concurrent seed executions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RBAC_SEED_ADVISORY_LOCK_KEY});`;

      // 2. Upsert canonical system roles via parameterized SQL against partial unique index
      for (const role of CANONICAL_SYSTEM_ROLES) {
        await tx.$executeRaw`
          INSERT INTO public.roles (id, organization_id, name, description, is_system_role, created_at)
          VALUES (gen_random_uuid(), NULL, ${role.name}, ${role.description}, true, NOW())
          ON CONFLICT (name) WHERE organization_id IS NULL
          DO UPDATE SET description = EXCLUDED.description;
        `;
      }

      // 3. Upsert approved permissions catalog using unique constraint on code
      for (const perm of PERMISSION_DEFINITIONS) {
        await tx.permission.upsert({
          where: { code: perm.code },
          create: {
            code: perm.code,
            description: perm.description,
            module: perm.module,
          },
          update: {
            description: perm.description,
            module: perm.module,
          },
        });
      }

      // 4. Resolve exact canonical role IDs
      const canonicalRoles = await tx.role.findMany({
        where: {
          isSystemRole: true,
          organizationId: null,
          name: { in: ['OWNER', 'ADMIN', 'MEMBER'] },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (canonicalRoles.length !== 3) {
        throw new Error(
          `RBAC Seed Integrity Failure: Expected 3 canonical system roles, found ${canonicalRoles.length}.`,
        );
      }

      const roleMap = new Map(canonicalRoles.map((r) => [r.name, r.id]));
      const ownerId = roleMap.get('OWNER');
      const adminId = roleMap.get('ADMIN');
      const memberId = roleMap.get('MEMBER');

      if (!ownerId || !adminId || !memberId) {
        throw new Error('RBAC Seed Integrity Failure: Incomplete canonical role resolution.');
      }

      const canonicalRoleIds = [ownerId, adminId, memberId];

      // 5. Resolve approved permissions
      const permissions = await tx.permission.findMany({
        where: {
          code: {
            in: [PermissionCode.PROJECTS_READ_ALL, PermissionCode.PROJECTS_MANAGE_ALL],
          },
        },
        select: {
          id: true,
          code: true,
        },
      });

      if (permissions.length !== 2) {
        throw new Error(
          `RBAC Seed Integrity Failure: Expected 2 approved permissions, found ${permissions.length}.`,
        );
      }

      const permMap = new Map(permissions.map((p) => [p.code, p.id]));
      const readAllId = permMap.get(PermissionCode.PROJECTS_READ_ALL);
      const manageAllId = permMap.get(PermissionCode.PROJECTS_MANAGE_ALL);

      if (!readAllId || !manageAllId) {
        throw new Error('RBAC Seed Integrity Failure: Incomplete permission resolution.');
      }

      // 6. Delete existing role-permission mappings ONLY for the three resolved canonical role IDs
      await tx.rolePermission.deleteMany({
        where: {
          roleId: {
            in: canonicalRoleIds,
          },
        },
      });

      // 7. Insert approved mapping matrix:
      // - OWNER  -> projects:read_all, projects:manage_all
      // - ADMIN  -> projects:read_all, projects:manage_all
      // - MEMBER -> (none)
      const mappingsToCreate = [
        { roleId: ownerId, permissionId: readAllId },
        { roleId: ownerId, permissionId: manageAllId },
        { roleId: adminId, permissionId: readAllId },
        { roleId: adminId, permissionId: manageAllId },
      ];

      await tx.rolePermission.createMany({
        data: mappingsToCreate,
      });

      return {
        rolesUpserted: canonicalRoles.length,
        permissionsUpserted: permissions.length,
        mappingsSynchronized: mappingsToCreate.length,
      };
    },
    {
      timeout: 15000,
    },
  );
}

// CLI entry point: executed only when called directly via `node` or `ts-node`
const isMain =
  typeof require !== 'undefined'
    ? require.main === module
    : process.argv[1] && process.argv[1].endsWith('seed.ts');

if (isMain) {
  const prisma = new PrismaClient();
  seedRbac(prisma)
    .then((result) => {
      console.log(
        `[RBAC Seed] Successfully synchronized ${result.rolesUpserted} canonical roles, ${result.permissionsUpserted} permissions, and ${result.mappingsSynchronized} role-permission mappings.`,
      );
      return prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error('[RBAC Seed Error] Seed failed:', error.message || error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

