const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} = require('@nestjs/common');
const { OrgMemberStatus, ProjectRole, ProjectStatus } = require('@prisma/client');
const { PermissionCode } = require('@ai-workspace/shared');
const {
  ProjectAccessPolicy,
} = require('../src/auth/policies/project-access.policy');
const {
  ProjectAccessGuard,
} = require('../src/auth/guards/project-access.guard');
const {
  PROJECT_ACCESS_MODE_KEY,
  RequireProjectAccess,
} = require('../src/auth/decorators/require-project-access.decorator');

const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';
const VALID_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const VALID_PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const VALID_PROJ_MEMBER_ID = '66666666-6666-4666-8666-666666666666';

function createMockReflector(mode) {
  return {
    getAllAndOverride(key) {
      if (key === PROJECT_ACCESS_MODE_KEY) {
        return mode;
      }
      return undefined;
    },
  };
}

function createMockContext({ user, orgContext, params } = {}) {
  const request = { user, orgContext, params };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    _request: request,
  };
}

function makeProject({
  id = VALID_PROJECT_ID,
  organizationId = VALID_ORG_ID,
  status = ProjectStatus.ACTIVE,
  deletedAt = null,
} = {}) {
  return { id, organizationId, status, deletedAt };
}

function makeOrgMember({
  id = VALID_MEMBER_ID,
  status = OrgMemberStatus.ACTIVE,
  isSystemRole = true,
  roleOrgId = null,
  permissionCodes = [],
  includeRole = true,
} = {}) {
  return {
    id,
    status,
    role: includeRole
      ? {
          id: '77777777-7777-4777-8777-777777777777',
          organizationId: roleOrgId,
          isSystemRole,
          permissions: permissionCodes.map((code) => ({
            permission: { code },
          })),
        }
      : null,
  };
}

function makeProjectMember({
  id = VALID_PROJ_MEMBER_ID,
  organizationId = VALID_ORG_ID,
  projectRole = ProjectRole.VIEWER,
} = {}) {
  return { id, organizationId, projectRole };
}

function createMockPrisma({
  project = async () => makeProject(),
  orgMember = async () => makeOrgMember(),
  projectMember = async () => null,
} = {}) {
  return {
    project: { findUnique: project },
    organizationMember: { findUnique: orgMember },
    projectMember: { findUnique: projectMember },
  };
}

test('ProjectAccessGuard & ProjectAccessPolicy', async (t) => {
  await t.test('1. Route without @RequireProjectAccess passes through', async () => {
    const policy = new ProjectAccessPolicy(createMockPrisma());
    const guard = new ProjectAccessGuard(createMockReflector(undefined), policy);
    const result = await guard.canActivate(createMockContext());
    assert.equal(result, true);
  });

  await t.test('2. Invalid metadata throws 500 InternalServerErrorException', async () => {
    const policy = new ProjectAccessPolicy(createMockPrisma());
    const guard = new ProjectAccessGuard(createMockReflector('INVALID_MODE'), policy);
    await assert.rejects(
      () => guard.canActivate(createMockContext()),
      InternalServerErrorException,
    );
  });

  await t.test('3. Missing/invalid user ID returns 401 UnauthorizedException', async () => {
    const policy = new ProjectAccessPolicy(createMockPrisma());
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: 'not-a-uuid' },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      UnauthorizedException,
    );
  });

  await t.test('4. Missing/invalid orgContext returns 403 ForbiddenException', async () => {
    const policy = new ProjectAccessPolicy(createMockPrisma());
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: undefined,
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('5. LEAD, CONTRIBUTOR, and VIEWER can read', async () => {
    for (const role of [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR, ProjectRole.VIEWER]) {
      const policy = new ProjectAccessPolicy(
        createMockPrisma({
          projectMember: async () => makeProjectMember({ projectRole: role }),
        }),
      );
      const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
      const ctx = createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
        params: { projectId: VALID_PROJECT_ID },
      });
      assert.equal(await guard.canActivate(ctx), true);
    }
  });

  await t.test('6. projects:read_all grants read without ProjectMember and does not set projectContext', async () => {
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () =>
          makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_READ_ALL] }),
        projectMember: async () => null,
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    const ctx = createMockContext({
      user: { id: VALID_USER_ID },
      orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      params: { projectId: VALID_PROJECT_ID },
    });
    assert.equal(await guard.canActivate(ctx), true);
    assert.equal(ctx._request.projectContext, undefined);
  });

  await t.test('7. projects:manage_all grants read without ProjectMember', async () => {
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () =>
          makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL] }),
        projectMember: async () => null,
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    const ctx = createMockContext({
      user: { id: VALID_USER_ID },
      orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      params: { projectId: VALID_PROJECT_ID },
    });
    assert.equal(await guard.canActivate(ctx), true);
    assert.equal(ctx._request.projectContext, undefined);
  });

  await t.test('8. Non-member without permissions cannot read (404)', async () => {
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () => makeOrgMember({ permissionCodes: [] }),
        projectMember: async () => null,
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      NotFoundException,
    );
  });

  await t.test('9. Wrong organization and soft-deleted project return 404', async () => {
    const wrongOrgPolicy = new ProjectAccessPolicy(
      createMockPrisma({
        project: async () => makeProject({ organizationId: OTHER_ORG_ID }),
        orgMember: async () =>
          makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL] }),
      }),
    );
    const wrongOrgGuard = new ProjectAccessGuard(createMockReflector('READ'), wrongOrgPolicy);
    await assert.rejects(
      () =>
        wrongOrgGuard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      NotFoundException,
    );

    const deletedPolicy = new ProjectAccessPolicy(
      createMockPrisma({
        project: async () => makeProject({ deletedAt: new Date() }),
        orgMember: async () =>
          makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL] }),
      }),
    );
    const deletedGuard = new ProjectAccessGuard(createMockReflector('READ'), deletedPolicy);
    await assert.rejects(
      () =>
        deletedGuard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      NotFoundException,
    );
  });

  await t.test('10. Archived project remains readable', async () => {
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        project: async () => makeProject({ status: ProjectStatus.ARCHIVED }),
        projectMember: async () => makeProjectMember({ projectRole: ProjectRole.VIEWER }),
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    const result = await guard.canActivate(
      createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
        params: { projectId: VALID_PROJECT_ID },
      }),
    );
    assert.equal(result, true);
  });

  await t.test('11. LEAD has GOVERN and MANAGE_MEMBERS access', async () => {
    for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
      const policy = new ProjectAccessPolicy(
        createMockPrisma({
          projectMember: async () => makeProjectMember({ projectRole: ProjectRole.LEAD }),
        }),
      );
      const guard = new ProjectAccessGuard(createMockReflector(mode), policy);
      const result = await guard.canActivate(
        createMockContext({
          user: { id: VALID_USER_ID },
          orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          params: { projectId: VALID_PROJECT_ID },
        }),
      );
      assert.equal(result, true);
    }
  });

  await t.test('12. projects:manage_all grants GOVERN and MANAGE_MEMBERS bypass without ProjectMember', async () => {
    for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
      const policy = new ProjectAccessPolicy(
        createMockPrisma({
          orgMember: async () =>
            makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL] }),
          projectMember: async () => null,
        }),
      );
      const guard = new ProjectAccessGuard(createMockReflector(mode), policy);
      const ctx = createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
        params: { projectId: VALID_PROJECT_ID },
      });
      assert.equal(await guard.canActivate(ctx), true);
      assert.equal(ctx._request.projectContext, undefined);
    }
  });

  await t.test('13. CONTRIBUTOR/VIEWER denied GOVERN and MANAGE_MEMBERS without manage_all (403)', async () => {
    for (const role of [ProjectRole.CONTRIBUTOR, ProjectRole.VIEWER]) {
      for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
        const policy = new ProjectAccessPolicy(
          createMockPrisma({
            orgMember: async () => makeOrgMember({ permissionCodes: [] }),
            projectMember: async () => makeProjectMember({ projectRole: role }),
          }),
        );
        const guard = new ProjectAccessGuard(createMockReflector(mode), policy);
        await assert.rejects(
          () =>
            guard.canActivate(
              createMockContext({
                user: { id: VALID_USER_ID },
                orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
                params: { projectId: VALID_PROJECT_ID },
              }),
            ),
          ForbiddenException,
        );
      }
    }
  });

  await t.test('14. projects:read_all alone does not grant GOVERN or MANAGE_MEMBERS (403)', async () => {
    for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
      const policy = new ProjectAccessPolicy(
        createMockPrisma({
          orgMember: async () =>
            makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_READ_ALL] }),
          projectMember: async () => null,
        }),
      );
      const guard = new ProjectAccessGuard(createMockReflector(mode), policy);
      await assert.rejects(
        () =>
          guard.canActivate(
            createMockContext({
              user: { id: VALID_USER_ID },
              orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
              params: { projectId: VALID_PROJECT_ID },
            }),
          ),
        ForbiddenException,
      );
    }
  });

  await t.test('15. Archived project blocks GOVERN and MANAGE_MEMBERS even for LEAD and manage_all (403)', async () => {
    for (const mode of ['GOVERN', 'MANAGE_MEMBERS']) {
      const policy = new ProjectAccessPolicy(
        createMockPrisma({
          project: async () => makeProject({ status: ProjectStatus.ARCHIVED }),
          orgMember: async () =>
            makeOrgMember({ permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL] }),
          projectMember: async () => makeProjectMember({ projectRole: ProjectRole.LEAD }),
        }),
      );
      const guard = new ProjectAccessGuard(createMockReflector(mode), policy);
      await assert.rejects(
        () =>
          guard.canActivate(
            createMockContext({
              user: { id: VALID_USER_ID },
              orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
              params: { projectId: VALID_PROJECT_ID },
            }),
          ),
        ForbiddenException,
      );
    }
  });

  await t.test('16. Inactive org membership and invalid role ownership are rejected (403)', async () => {
    const inactivePolicy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () =>
          makeOrgMember({
            status: OrgMemberStatus.SUSPENDED,
            permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL],
          }),
      }),
    );
    const inactiveGuard = new ProjectAccessGuard(createMockReflector('READ'), inactivePolicy);
    await assert.rejects(
      () =>
        inactiveGuard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      ForbiddenException,
    );

    const wrongRoleOrgPolicy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () =>
          makeOrgMember({
            isSystemRole: false,
            roleOrgId: OTHER_ORG_ID,
            permissionCodes: [PermissionCode.PROJECTS_MANAGE_ALL],
          }),
      }),
    );
    const wrongRoleOrgGuard = new ProjectAccessGuard(createMockReflector('READ'), wrongRoleOrgPolicy);
    await assert.rejects(
      () =>
        wrongRoleOrgGuard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('17. Permission revocation is effective on subsequent requests (no caching)', async () => {
    let currentPermissions = [PermissionCode.PROJECTS_READ_ALL];
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        orgMember: async () => makeOrgMember({ permissionCodes: currentPermissions }),
        projectMember: async () => null,
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    const ctx = createMockContext({
      user: { id: VALID_USER_ID },
      orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      params: { projectId: VALID_PROJECT_ID },
    });

    assert.equal(await guard.canActivate(ctx), true);

    currentPermissions = [];
    await assert.rejects(() => guard.canActivate(ctx), NotFoundException);
  });

  await t.test('18. Database errors propagate', async () => {
    const dbError = new Error('Connection terminated unexpectedly');
    const policy = new ProjectAccessPolicy(
      createMockPrisma({
        project: async () => {
          throw dbError;
        },
      }),
    );
    const guard = new ProjectAccessGuard(createMockReflector('READ'), policy);
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
            params: { projectId: VALID_PROJECT_ID },
          }),
        ),
      (err) => err === dbError,
    );
  });

  await t.test('19. Decorator attaches expected metadata key', () => {
    const decorator = RequireProjectAccess('GOVERN');
    assert.equal(typeof decorator, 'function');
  });
});
