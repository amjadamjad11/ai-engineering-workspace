const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');
const { Prisma, OrgMemberStatus } = require('@prisma/client');
const { OrgTenantGuard } = require('../dist/auth/guards/org-tenant.guard');
const { IS_PUBLIC_KEY } = require('../dist/auth/decorators/public.decorator');

test('OrgTenantGuard — Organization Tenant Boundary Authorization Suite', async (t) => {
  const validOrgId = 'a0000000-0000-4000-8000-000000000001';
  const validUserId = 'u0000000-0000-4000-8000-000000000001';
  const validMemberId = 'm0000000-0000-4000-8000-000000000001';
  const validRoleId = 'r0000000-0000-4000-8000-000000000001';

  const createMockExecutionContext = (options = {}) => {
    const user = Object.prototype.hasOwnProperty.call(options, 'user')
      ? options.user
      : { id: validUserId };
    const params = Object.prototype.hasOwnProperty.call(options, 'params')
      ? options.params
      : { orgId: validOrgId };
    const body = options.body || {};
    const headers = options.headers || {};
    const isPublic = options.isPublic || false;

    const request = {
      user,
      params,
      body,
      headers,
      orgContext: undefined,
    };

    const handler = () => {};
    const targetClass = class {};

    const reflector = {
      getAllAndOverride: (key) => {
        if (key === IS_PUBLIC_KEY) {
          return isPublic;
        }
        return undefined;
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    };

    return { context, reflector, request };
  };

  const createMockPrismaService = (findUniqueResult) => {
    let queriedWhere = null;
    let queriedSelect = null;

    const prisma = {
      organizationMember: {
        findUnique: async (args) => {
          queriedWhere = args.where;
          queriedSelect = args.select;
          if (findUniqueResult instanceof Error) {
            throw findUniqueResult;
          }
          return findUniqueResult;
        },
      },
      getQueries: () => ({ queriedWhere, queriedSelect }),
    };

    return prisma;
  };

  const createValidMemberRecord = (overrides = {}) => ({
    id: validMemberId,
    status: OrgMemberStatus.ACTIVE,
    organization: {
      id: validOrgId,
      deletedAt: null,
    },
    role: {
      id: validRoleId,
      name: 'MEMBER',
      isSystemRole: true,
    },
    ...overrides,
  });

  await t.test('1. ACTIVE organization membership allows access and attaches verified orgContext', async () => {
    const mockRecord = createValidMemberRecord();
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.ok(request.orgContext);
    assert.equal(request.orgContext.organizationId, validOrgId);
    assert.equal(request.orgContext.organizationMemberId, validMemberId);
    assert.equal(request.orgContext.roleId, validRoleId);
    assert.equal(request.orgContext.roleName, 'MEMBER');
    assert.equal(request.orgContext.isSystemRole, true);
    assert.ok(Object.isFrozen(request.orgContext));

    const { queriedWhere, queriedSelect } = prisma.getQueries();
    assert.deepEqual(queriedWhere, {
      uq_org_member: {
        organizationId: validOrgId,
        userId: validUserId,
      },
    });
    assert.ok(queriedSelect.status);
    assert.ok(queriedSelect.organization);
    assert.ok(queriedSelect.role);
  });

  await t.test('2. INVITED membership is rejected with safe 403 Forbidden', async () => {
    const mockRecord = createValidMemberRecord({ status: OrgMemberStatus.INVITED });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        assert.equal(err.message, 'Organization membership is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('3. SUSPENDED membership is rejected with safe 403 Forbidden', async () => {
    const mockRecord = createValidMemberRecord({ status: OrgMemberStatus.SUSPENDED });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        assert.equal(err.message, 'Organization membership is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('4. INACTIVE membership is rejected with safe 403 Forbidden', async () => {
    const mockRecord = createValidMemberRecord({ status: OrgMemberStatus.INACTIVE });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        assert.equal(err.message, 'Organization membership is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('5. Missing organization membership is rejected safely with 404 (non-disclosure)', async () => {
    const prisma = createMockPrismaService(null); // No record
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Organization not found.');
        return true;
      },
    );
  });

  await t.test('6. Missing organization is rejected safely with 404', async () => {
    const prisma = createMockPrismaService(null);
    const { context, reflector } = createMockExecutionContext({
      params: { orgId: 'b0000000-0000-4000-8000-000000000002' },
    });

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Organization not found.');
        return true;
      },
    );
  });

  await t.test('7. Soft-deleted organization is rejected with 404', async () => {
    const mockRecord = createValidMemberRecord({
      organization: {
        id: validOrgId,
        deletedAt: new Date(),
      },
    });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Organization not found.');
        return true;
      },
    );
  });

  await t.test('8. Missing authenticated user rejects safely with 401 Unauthorized', async () => {
    const prisma = createMockPrismaService(createValidMemberRecord());
    const invalidUserCases = [
      { user: undefined },
      { user: null },
      { user: {} },
      { user: { id: '' } },
      { user: { id: null } },
      { user: { id: 12345 } },
    ];

    for (const contextConfig of invalidUserCases) {
      const { context, reflector } = createMockExecutionContext(contextConfig);
      const guard = new OrgTenantGuard(reflector, prisma);

      await assert.rejects(
        async () => {
          await guard.canActivate(context);
        },
        (err) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.equal(err.getStatus(), 401);
          assert.equal(err.message, 'Authentication required.');
          return true;
        },
      );
    }

    assert.equal(prisma.getQueries().queriedWhere, null);
  });

  await t.test('9. Missing or malformed organization route parameter is rejected with 404', async () => {
    const prisma = createMockPrismaService(createValidMemberRecord());
    const invalidParamCases = [
      {},
      { orgId: '' },
      { orgId: '   ' },
      { orgId: 'not-a-valid-uuid' },
      { orgId: 12345 },
      { orgId: null },
      { orgId: undefined },
      { orgId: '12345678-1234-1234-1234-12345678901' }, // Too short
    ];

    for (const params of invalidParamCases) {
      const { context, reflector } = createMockExecutionContext({ params });
      const guard = new OrgTenantGuard(reflector, prisma);

      await assert.rejects(
        async () => {
          await guard.canActivate(context);
        },
        (err) => {
          assert.ok(err instanceof NotFoundException);
          assert.equal(err.getStatus(), 404);
          assert.equal(err.message, 'Organization not found.');
          return true;
        },
      );
    }

    // Database lookup must never occur for invalid route params
    assert.equal(prisma.getQueries().queriedWhere, null);
  });

  await t.test('10. Body-supplied or header-supplied organization ID cannot override route parameter', async () => {
    const attackerOrgId = 'e0000000-0000-4000-8000-000000000099';
    const mockRecord = createValidMemberRecord();
    const prisma = createMockPrismaService(mockRecord);

    const { context, reflector, request } = createMockExecutionContext({
      params: { orgId: validOrgId },
      body: { organizationId: attackerOrgId, orgId: attackerOrgId },
      headers: { 'x-org-id': attackerOrgId },
    });

    const guard = new OrgTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    // Verified orgContext strictly reflects route parameter, ignoring body/headers
    assert.equal(request.orgContext.organizationId, validOrgId);
    assert.notEqual(request.orgContext.organizationId, attackerOrgId);

    const { queriedWhere } = prisma.getQueries();
    assert.equal(queriedWhere.uq_org_member.organizationId, validOrgId);
  });

  await t.test('11. @Public() route bypasses organization membership check safely', async () => {
    const prisma = createMockPrismaService(createValidMemberRecord({ status: OrgMemberStatus.SUSPENDED }));
    const { context, reflector, request } = createMockExecutionContext({
      user: undefined,
      params: {},
      isPublic: true,
    });

    const guard = new OrgTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.equal(request.orgContext, undefined); // Public route does not receive false orgContext
    assert.equal(prisma.getQueries().queriedWhere, null); // Query skipped
  });

  await t.test('12. Database connectivity failure bubbles up to exception filter', async () => {
    const connectivityError = new Prisma.PrismaClientKnownRequestError(
      'Can not reach database server at postgresql://postgres:pw@host',
      {
        code: 'P1001',
        clientVersion: '6.19.3',
      },
    );

    const prisma = createMockPrismaService(connectivityError);
    const { context, reflector } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, 'P1001');
        return true;
      },
    );
  });

  await t.test('13. Supports organizationId route param convention seamlessly', async () => {
    const mockRecord = createValidMemberRecord();
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext({
      params: { organizationId: validOrgId }, // Using alternative param name
    });

    const guard = new OrgTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.equal(prisma.getQueries().queriedWhere.uq_org_member.organizationId, validOrgId);
  });

  await t.test('14. Request context contains strictly verified fields and prevents unsafe mutation', async () => {
    const mockRecord = createValidMemberRecord();
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new OrgTenantGuard(reflector, prisma);
    await guard.canActivate(context);

    assert.deepEqual(Object.keys(request.orgContext).sort(), [
      'isSystemRole',
      'organizationId',
      'organizationMemberId',
      'roleId',
      'roleName',
    ]);

    // Verifies immutability
    assert.throws(
      () => {
        'use strict';
        request.orgContext.organizationId = 'mutated';
      },
      (err) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );
  });
});
