const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} = require('@nestjs/common');
const { OrgMemberStatus } = require('@prisma/client');
const { PermissionCode } = require('@ai-workspace/shared');

const { PermissionsGuard } = require('../dist/auth/guards/permissions.guard');
const {
  REQUIRED_PERMISSIONS_KEY,
} = require('../dist/auth/decorators/require-permissions.decorator');

const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_ORG_ID = '22222222-2222-4222-8222-222222222222';
const VALID_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const VALID_ROLE_ID = '55555555-5555-4555-8555-555555555555';

function createMockContext({ user, orgContext } = {}) {
  const request = { user, orgContext };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => () => {},
    getClass: () => class TestController {},
  };
}

function createMockReflector(metadataValue) {
  return {
    getAllAndOverride: (key) => {
      if (key === REQUIRED_PERMISSIONS_KEY) {
        return metadataValue;
      }
      return undefined;
    },
  };
}

function createMockPrisma(findUniqueImpl) {
  return {
    organizationMember: {
      findUnique: findUniqueImpl,
    },
  };
}

function makeMemberRecord({
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
          id: VALID_ROLE_ID,
          organizationId: roleOrgId,
          isSystemRole,
          permissions: permissionCodes.map((code) => ({
            permission: { code },
          })),
        }
      : null,
  };
}

test('PermissionsGuard — Organization RBAC Authorization Suite', async (t) => {
  await t.test('1. No permission metadata returns true', async () => {
    let dbCalled = false;
    const guard = new PermissionsGuard(
      createMockReflector(undefined),
      createMockPrisma(async () => {
        dbCalled = true;
        return null;
      }),
    );
    const result = await guard.canActivate(createMockContext({}));
    assert.equal(result, true);
    assert.equal(dbCalled, false);
  });

  await t.test('2. Empty metadata is rejected with 500', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () => guard.canActivate(createMockContext({ user: { id: VALID_USER_ID } })),
      InternalServerErrorException,
    );
  });

  await t.test('3. Malformed metadata is rejected with 500', async () => {
    const guard = new PermissionsGuard(
      createMockReflector('projects:read_all'),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () => guard.canActivate(createMockContext({ user: { id: VALID_USER_ID } })),
      InternalServerErrorException,
    );
  });

  await t.test('4. Unknown permission codes in metadata are rejected with 500', async () => {
    const guard = new PermissionsGuard(
      createMockReflector(['tasks:delete_all']),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () => guard.canActivate(createMockContext({ user: { id: VALID_USER_ID } })),
      InternalServerErrorException,
    );
  });

  await t.test('5. Required single permission is granted', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({ permissionCodes: [PermissionCode.PROJECTS_READ_ALL] }),
      ),
    );
    const result = await guard.canActivate(
      createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      }),
    );
    assert.equal(result, true);
  });

  await t.test('6. Required single permission is denied', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_MANAGE_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({ permissionCodes: [PermissionCode.PROJECTS_READ_ALL] }),
      ),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('7. Multiple permissions are all granted', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([
        PermissionCode.PROJECTS_READ_ALL,
        PermissionCode.PROJECTS_MANAGE_ALL,
      ]),
      createMockPrisma(async () =>
        makeMemberRecord({
          permissionCodes: [
            PermissionCode.PROJECTS_READ_ALL,
            PermissionCode.PROJECTS_MANAGE_ALL,
          ],
        }),
      ),
    );
    const result = await guard.canActivate(
      createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      }),
    );
    assert.equal(result, true);
  });

  await t.test('8. Partial permissions are denied', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([
        PermissionCode.PROJECTS_READ_ALL,
        PermissionCode.PROJECTS_MANAGE_ALL,
      ]),
      createMockPrisma(async () =>
        makeMemberRecord({ permissionCodes: [PermissionCode.PROJECTS_READ_ALL] }),
      ),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('9. Missing authenticated user returns 401', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: undefined,
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      UnauthorizedException,
    );
  });

  await t.test('10. Invalid user ID returns 401', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: 'not-a-uuid' },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      UnauthorizedException,
    );
  });

  await t.test('11. Missing OrgContext returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () => guard.canActivate(createMockContext({ user: { id: VALID_USER_ID } })),
      ForbiddenException,
    );
  });

  await t.test('12. Malformed OrgContext returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: 'bad', organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('13. Missing OrganizationMember returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => null),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('14. Inactive OrganizationMember returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({
          status: OrgMemberStatus.SUSPENDED,
          permissionCodes: [PermissionCode.PROJECTS_READ_ALL],
        }),
      ),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('15. Context membership ID mismatch returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({
          id: OTHER_MEMBER_ID,
          permissionCodes: [PermissionCode.PROJECTS_READ_ALL],
        }),
      ),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('16. Missing role returns 403', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => makeMemberRecord({ includeRole: false })),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('17. System role permission resolution', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({
          isSystemRole: true,
          roleOrgId: null,
          permissionCodes: [PermissionCode.PROJECTS_READ_ALL],
        }),
      ),
    );
    const result = await guard.canActivate(
      createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      }),
    );
    assert.equal(result, true);
  });

  await t.test('18. Custom organization role permission resolution', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({
          isSystemRole: false,
          roleOrgId: VALID_ORG_ID,
          permissionCodes: [PermissionCode.PROJECTS_READ_ALL],
        }),
      ),
    );
    const result = await guard.canActivate(
      createMockContext({
        user: { id: VALID_USER_ID },
        orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
      }),
    );
    assert.equal(result, true);
  });

  await t.test('19. Unknown DB permission codes cannot grant an unrecognized requirement', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () =>
        makeMemberRecord({ permissionCodes: ['unknown:perm'] }),
      ),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('20. JWT role/appMetadata claims cannot grant permissions without DB mappings', async () => {
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_MANAGE_ALL]),
      createMockPrisma(async () => makeMemberRecord({ permissionCodes: [] })),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: {
              id: VALID_USER_ID,
              role: 'OWNER',
              appMetadata: { permissions: [PermissionCode.PROJECTS_MANAGE_ALL] },
            },
            orgContext: {
              organizationId: VALID_ORG_ID,
              organizationMemberId: VALID_MEMBER_ID,
              roleName: 'OWNER',
            },
          }),
        ),
      ForbiddenException,
    );
  });

  await t.test('21. Database errors propagate correctly', async () => {
    const dbError = new Error('Connection terminated unexpectedly');
    const guard = new PermissionsGuard(
      createMockReflector([PermissionCode.PROJECTS_READ_ALL]),
      createMockPrisma(async () => {
        throw dbError;
      }),
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          createMockContext({
            user: { id: VALID_USER_ID },
            orgContext: { organizationId: VALID_ORG_ID, organizationMemberId: VALID_MEMBER_ID },
          }),
        ),
      (err) => err === dbError,
    );
  });
});
