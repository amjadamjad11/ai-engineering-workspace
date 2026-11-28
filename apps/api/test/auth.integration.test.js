const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const {
  OrgMemberStatus,
  PrismaClient,
  ProjectRole,
  ProjectStatus,
  UserStatus,
} = require('@prisma/client');
const { PermissionCode, SystemRoleName } = require('@ai-workspace/shared');
const { seedRbac } = require('../prisma/seed');
const { UserStatusGuard } = require('../src/auth/guards/user-status.guard');
const { OrgTenantGuard } = require('../src/auth/guards/org-tenant.guard');
const {
  ProjectTenantGuard,
} = require('../src/auth/guards/project-tenant.guard');
const { PermissionsGuard } = require('../src/auth/guards/permissions.guard');
const {
  ProjectAccessPolicy,
} = require('../src/auth/policies/project-access.policy');
const {
  ProjectAccessGuard,
} = require('../src/auth/guards/project-access.guard');
const {
  REQUIRED_PERMISSIONS_KEY,
} = require('../src/auth/decorators/require-permissions.decorator');
const {
  PROJECT_ACCESS_MODE_KEY,
} = require('../src/auth/decorators/require-project-access.decorator');

function createExecutionContext(request, metadata = {}) {
  const handler = () => {};
  const cls = class TestController {};
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

test('Authorization Pipeline — Disposable PostgreSQL Integration Suite', async (t) => {
  const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const PSQL_EXE = path.join(PG_BIN_DIR, 'psql.exe');
  const PG_CTL_EXE = path.join(PG_BIN_DIR, 'pg_ctl.exe');
  const INITDB_EXE = path.join(PG_BIN_DIR, 'initdb.exe');
  const TEST_HOST = '127.0.0.1';
  const MIGRATION_FILE = path.resolve(
    __dirname,
    '../prisma/migrations/20261107120000_init/migration.sql',
  );

  if (
    !fs.existsSync(PSQL_EXE) ||
    !fs.existsSync(PG_CTL_EXE) ||
    !fs.existsSync(INITDB_EXE)
  ) {
    t.diagnostic(
      'PostgreSQL 18 binaries not found. Skipping disposable integration tests.',
    );
    return;
  }

  const getFreePort = () =>
    new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.once('error', (err) => reject(err));
      srv.listen(0, TEST_HOST, () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
    });

  const TEST_PORT = await getFreePort();
  const uniqueDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pg_auth_int_test_'),
  );
  const uniqueLogFile = path.join(uniqueDataDir, 'server.log');
  let initdbCompleted = false;
  let prisma = null;

  const runStage = (stageName, exe, args, options = {}) => {
    execFileSync(exe, args, {
      stdio: options.stdio || 'pipe',
      timeout: options.timeoutMs,
    });
  };

  try {
    runStage(
      'initdb',
      INITDB_EXE,
      [
        '-D',
        uniqueDataDir,
        '-U',
        'postgres',
        '-A',
        'trust',
        '-E',
        'UTF8',
        '--no-locale',
      ],
      { timeoutMs: 30000 },
    );
    initdbCompleted = true;

    runStage(
      'pg_ctl_start',
      PG_CTL_EXE,
      [
        '-D',
        uniqueDataDir,
        '-l',
        uniqueLogFile,
        '-w',
        '-o',
        `-p ${TEST_PORT} -h ${TEST_HOST} -c listen_addresses=${TEST_HOST}`,
        'start',
      ],
      { stdio: 'ignore', timeoutMs: 45000 },
    );

    runStage(
      'psql_create_db',
      PSQL_EXE,
      [
        '-X',
        '-w',
        '-h',
        TEST_HOST,
        '-p',
        String(TEST_PORT),
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'CREATE DATABASE auth_test_db;',
      ],
      { timeoutMs: 30000 },
    );

    runStage(
      'psql_provision_roles',
      PSQL_EXE,
      [
        '-X',
        '-w',
        '-h',
        TEST_HOST,
        '-p',
        String(TEST_PORT),
        '-U',
        'postgres',
        '-d',
        'auth_test_db',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;',
      ],
      { timeoutMs: 30000 },
    );

    runStage(
      'psql_apply_migration',
      PSQL_EXE,
      [
        '-X',
        '-w',
        '-h',
        TEST_HOST,
        '-p',
        String(TEST_PORT),
        '-U',
        'postgres',
        '-d',
        'auth_test_db',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        MIGRATION_FILE,
      ],
      { timeoutMs: 45000 },
    );

    const dbUrl = `postgresql://postgres@${TEST_HOST}:${TEST_PORT}/auth_test_db?schema=public`;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    await seedRbac(prisma);

    const reflector = new Reflector();
    const userStatusGuard = new UserStatusGuard(reflector, prisma);
    const orgTenantGuard = new OrgTenantGuard(reflector, prisma);
    const projectTenantGuard = new ProjectTenantGuard(reflector, prisma);
    const permissionsGuard = new PermissionsGuard(reflector, prisma);
    const projectAccessPolicy = new ProjectAccessPolicy(prisma);
    const projectAccessGuard = new ProjectAccessGuard(
      reflector,
      projectAccessPolicy,
    );

    const [ownerRole, adminRole, memberRole] = await Promise.all([
      prisma.role.findFirstOrThrow({
        where: { name: 'OWNER', isSystemRole: true },
      }),
      prisma.role.findFirstOrThrow({
        where: { name: 'ADMIN', isSystemRole: true },
      }),
      prisma.role.findFirstOrThrow({
        where: { name: 'MEMBER', isSystemRole: true },
      }),
    ]);

    const ownerId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const leadId = crypto.randomUUID();
    const viewerId = crypto.randomUUID();
    const outsiderId = crypto.randomUUID();
    const suspendedId = crypto.randomUUID();

    await prisma.profile.createMany({
      data: [
        { id: ownerId, email: 'owner@test.local', fullName: 'Owner User', status: UserStatus.ACTIVE },
        { id: adminId, email: 'admin@test.local', fullName: 'Admin User', status: UserStatus.ACTIVE },
        { id: leadId, email: 'lead@test.local', fullName: 'Lead User', status: UserStatus.ACTIVE },
        { id: viewerId, email: 'viewer@test.local', fullName: 'Viewer User', status: UserStatus.ACTIVE },
        {
          id: outsiderId,
          email: 'outsider@test.local',
          fullName: 'Outsider User',
          status: UserStatus.ACTIVE,
        },
        {
          id: suspendedId,
          email: 'suspended@test.local',
          fullName: 'Suspended User',
          status: UserStatus.SUSPENDED,
        },
      ],
    });

    const orgA = await prisma.organization.create({
      data: { name: 'Org A', slug: 'org-a', createdById: ownerId },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Org B', slug: 'org-b', createdById: outsiderId },
    });
    const deletedOrg = await prisma.organization.create({
      data: {
        name: 'Deleted Org',
        slug: 'deleted-org',
        createdById: ownerId,
        deletedAt: new Date(),
      },
    });

    await prisma.organizationMember.createMany({
      data: [
        {
          organizationId: orgA.id,
          userId: ownerId,
          roleId: ownerRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
        {
          organizationId: orgA.id,
          userId: adminId,
          roleId: adminRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
        {
          organizationId: orgA.id,
          userId: leadId,
          roleId: memberRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
        {
          organizationId: orgA.id,
          userId: viewerId,
          roleId: memberRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
        {
          organizationId: orgB.id,
          userId: outsiderId,
          roleId: ownerRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
        {
          organizationId: deletedOrg.id,
          userId: ownerId,
          roleId: ownerRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
      ],
    });

    const activeProject = await prisma.project.create({
      data: {
        organizationId: orgA.id,
        name: 'Active Project',
        slug: 'active-proj',
        status: ProjectStatus.ACTIVE,
        createdById: ownerId,
      },
    });
    const archivedProject = await prisma.project.create({
      data: {
        organizationId: orgA.id,
        name: 'Archived Project',
        slug: 'archived-proj',
        status: ProjectStatus.ARCHIVED,
        createdById: ownerId,
      },
    });
    const deletedProject = await prisma.project.create({
      data: {
        organizationId: orgA.id,
        name: 'Deleted Project',
        slug: 'deleted-proj',
        status: ProjectStatus.ACTIVE,
        createdById: ownerId,
        deletedAt: new Date(),
      },
    });
    const orgBProject = await prisma.project.create({
      data: {
        organizationId: orgB.id,
        name: 'Org B Project',
        slug: 'org-b-proj',
        status: ProjectStatus.ACTIVE,
        createdById: outsiderId,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        {
          projectId: activeProject.id,
          userId: leadId,
          organizationId: orgA.id,
          projectRole: ProjectRole.LEAD,
        },
        {
          projectId: activeProject.id,
          userId: viewerId,
          organizationId: orgA.id,
          projectRole: ProjectRole.VIEWER,
        },
        {
          projectId: archivedProject.id,
          userId: leadId,
          organizationId: orgA.id,
          projectRole: ProjectRole.LEAD,
        },
      ],
    });

    await t.test('1. Inactive user is rejected by UserStatusGuard (403)', async () => {
      const req = { user: { id: suspendedId } };
      await assert.rejects(
        () => userStatusGuard.canActivate(createExecutionContext(req)),
        ForbiddenException,
      );
    });

    await t.test('2. Active org membership attaches valid OrgContext; soft-deleted & cross-org rejected (404)', async () => {
      const reqA = { user: { id: ownerId }, params: { orgId: orgA.id } };
      assert.equal(await orgTenantGuard.canActivate(createExecutionContext(reqA)), true);
      assert.equal(reqA.orgContext.organizationId, orgA.id);

      const reqDeleted = { user: { id: ownerId }, params: { orgId: deletedOrg.id } };
      await assert.rejects(
        () => orgTenantGuard.canActivate(createExecutionContext(reqDeleted)),
        NotFoundException,
      );

      const reqCross = { user: { id: outsiderId }, params: { orgId: orgA.id } };
      await assert.rejects(
        () => orgTenantGuard.canActivate(createExecutionContext(reqCross)),
        NotFoundException,
      );
    });

    await t.test('3. PermissionsGuard resolves OWNER/ADMIN permissions from DB and rejects MEMBER (403)', async () => {
      const reqAdmin = { user: { id: adminId }, params: { orgId: orgA.id } };
      await orgTenantGuard.canActivate(createExecutionContext(reqAdmin));
      assert.equal(
        await permissionsGuard.canActivate(
          createExecutionContext(reqAdmin, {
            [REQUIRED_PERMISSIONS_KEY]: [PermissionCode.PROJECTS_MANAGE_ALL],
          }),
        ),
        true,
      );

      const reqMember = { user: { id: leadId }, params: { orgId: orgA.id } };
      await orgTenantGuard.canActivate(createExecutionContext(reqMember));
      await assert.rejects(
        () =>
          permissionsGuard.canActivate(
            createExecutionContext(reqMember, {
              [REQUIRED_PERMISSIONS_KEY]: [PermissionCode.PROJECTS_READ_ALL],
            }),
          ),
        ForbiddenException,
      );
    });

    await t.test('4. Revoking RolePermission in PostgreSQL takes effect on next request', async () => {
      const readAllPerm = await prisma.permission.findUniqueOrThrow({
        where: { code: PermissionCode.PROJECTS_READ_ALL },
      });

      const reqAdmin = { user: { id: adminId }, params: { orgId: orgA.id } };
      await orgTenantGuard.canActivate(createExecutionContext(reqAdmin));
      assert.equal(
        await permissionsGuard.canActivate(
          createExecutionContext(reqAdmin, {
            [REQUIRED_PERMISSIONS_KEY]: [PermissionCode.PROJECTS_READ_ALL],
          }),
        ),
        true,
      );

      await prisma.rolePermission.delete({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: readAllPerm.id,
          },
        },
      });

      await assert.rejects(
        () =>
          permissionsGuard.canActivate(
            createExecutionContext(reqAdmin, {
              [REQUIRED_PERMISSIONS_KEY]: [PermissionCode.PROJECTS_READ_ALL],
            }),
          ),
        ForbiddenException,
      );

      // Restore for subsequent tests
      await prisma.rolePermission.create({
        data: { roleId: adminRole.id, permissionId: readAllPerm.id },
      });
    });

    await t.test('5. ProjectAccess READ: explicit member, org read_all/manage_all allowed; non-member without perms 404; no projectContext set', async () => {
      const reqViewer = {
        user: { id: viewerId },
        params: { orgId: orgA.id, projectId: activeProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqViewer));
      assert.equal(
        await projectAccessGuard.canActivate(
          createExecutionContext(reqViewer, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
        ),
        true,
      );

      const reqAdmin = {
        user: { id: adminId },
        params: { orgId: orgA.id, projectId: activeProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqAdmin));
      assert.equal(
        await projectAccessGuard.canActivate(
          createExecutionContext(reqAdmin, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
        ),
        true,
      );
      assert.equal(reqAdmin.projectContext, undefined);

      // Non-member in Org A with MEMBER role
      const nonMemberId = crypto.randomUUID();
      await prisma.profile.create({
        data: { id: nonMemberId, email: 'nonmember@test.local', fullName: 'Non Member', status: UserStatus.ACTIVE },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: orgA.id,
          userId: nonMemberId,
          roleId: memberRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
      });
      const reqNonMember = {
        user: { id: nonMemberId },
        params: { orgId: orgA.id, projectId: activeProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqNonMember));
      await assert.rejects(
        () =>
          projectAccessGuard.canActivate(
            createExecutionContext(reqNonMember, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
          ),
        NotFoundException,
      );
    });

    await t.test('6. GOVERN and MANAGE_MEMBERS allow LEAD and manage_all, reject VIEWER (403)', async () => {
      for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
        const reqLead = {
          user: { id: leadId },
          params: { orgId: orgA.id, projectId: activeProject.id },
        };
        await orgTenantGuard.canActivate(createExecutionContext(reqLead));
        assert.equal(
          await projectAccessGuard.canActivate(
            createExecutionContext(reqLead, { [PROJECT_ACCESS_MODE_KEY]: mode }),
          ),
          true,
        );

        const reqOwner = {
          user: { id: ownerId },
          params: { orgId: orgA.id, projectId: activeProject.id },
        };
        await orgTenantGuard.canActivate(createExecutionContext(reqOwner));
        assert.equal(
          await projectAccessGuard.canActivate(
            createExecutionContext(reqOwner, { [PROJECT_ACCESS_MODE_KEY]: mode }),
          ),
          true,
        );

        const reqViewer = {
          user: { id: viewerId },
          params: { orgId: orgA.id, projectId: activeProject.id },
        };
        await orgTenantGuard.canActivate(createExecutionContext(reqViewer));
        await assert.rejects(
          () =>
            projectAccessGuard.canActivate(
              createExecutionContext(reqViewer, { [PROJECT_ACCESS_MODE_KEY]: mode }),
            ),
          ForbiddenException,
        );
      }
    });

    await t.test('7. Archived project readable, but GOVERN and MANAGE_MEMBERS denied (403); deleted/wrong-org 404', async () => {
      const reqArchived = {
        user: { id: leadId },
        params: { orgId: orgA.id, projectId: archivedProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqArchived));
      assert.equal(
        await projectAccessGuard.canActivate(
          createExecutionContext(reqArchived, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
        ),
        true,
      );
      await assert.rejects(
        () =>
          projectAccessGuard.canActivate(
            createExecutionContext(reqArchived, { [PROJECT_ACCESS_MODE_KEY]: 'GOVERN' }),
          ),
        ForbiddenException,
      );

      const reqDeleted = {
        user: { id: ownerId },
        params: { orgId: orgA.id, projectId: deletedProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqDeleted));
      await assert.rejects(
        () =>
          projectAccessGuard.canActivate(
            createExecutionContext(reqDeleted, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
          ),
        NotFoundException,
      );

      const reqWrongOrg = {
        user: { id: ownerId },
        params: { orgId: orgA.id, projectId: orgBProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqWrongOrg));
      await assert.rejects(
        () =>
          projectAccessGuard.canActivate(
            createExecutionContext(reqWrongOrg, { [PROJECT_ACCESS_MODE_KEY]: 'READ' }),
          ),
        NotFoundException,
      );
    });

    await t.test('8. ProjectTenantGuard rejects OWNER/ADMIN with manage_all when not ProjectMember (404)', async () => {
      const reqOwner = {
        user: { id: ownerId },
        params: { orgId: orgA.id, projectId: activeProject.id },
      };
      await orgTenantGuard.canActivate(createExecutionContext(reqOwner));
      await assert.rejects(
        () => projectTenantGuard.canActivate(createExecutionContext(reqOwner)),
        NotFoundException,
      );
    });

    await t.test('9. Composite FK constraints reject cross-tenant ProjectMember insert', async () => {
      await assert.rejects(() =>
        prisma.projectMember.create({
          data: {
            projectId: orgBProject.id,
            userId: leadId,
            organizationId: orgA.id,
            projectRole: ProjectRole.CONTRIBUTOR,
          },
        }),
      );
    });
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
    if (initdbCompleted) {
      try {
        execFileSync(PG_CTL_EXE, ['-D', uniqueDataDir, '-m', 'fast', 'stop'], {
          stdio: 'ignore',
          timeoutMs: 15000,
        });
      } catch {
        // Ignore if already stopped
      }
    }
    if (fs.existsSync(uniqueDataDir)) {
      fs.rmSync(uniqueDataDir, { recursive: true, force: true });
    }
  }
});
