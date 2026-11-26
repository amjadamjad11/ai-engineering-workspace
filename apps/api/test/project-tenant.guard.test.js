const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');
const { Prisma, ProjectRole } = require('@prisma/client');
const { ProjectTenantGuard } = require('../dist/auth/guards/project-tenant.guard');
const { IS_PUBLIC_KEY } = require('../dist/auth/decorators/public.decorator');

test('ProjectTenantGuard — Project Tenant Boundary Authorization Suite', async (t) => {
  const validOrgId = 'a0000000-0000-4000-8000-000000000001';
  const validProjectId = 'b0000000-0000-4000-8000-000000000001';
  const validUserId = 'c0000000-0000-4000-8000-000000000001';
  const validMemberId = 'd0000000-0000-4000-8000-000000000001';

  const createMockExecutionContext = (options = {}) => {
    const user = Object.prototype.hasOwnProperty.call(options, 'user')
      ? options.user
      : { id: validUserId };
    const orgContext = Object.prototype.hasOwnProperty.call(options, 'orgContext')
      ? options.orgContext
      : { organizationId: validOrgId };
    const params = Object.prototype.hasOwnProperty.call(options, 'params')
      ? options.params
      : { projectId: validProjectId };
    const body = options.body || {};
    const headers = options.headers || {};
    const isPublic = options.isPublic || false;

    const request = {
      user,
      orgContext,
      params,
      body,
      headers,
      projectContext: undefined,
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
      projectMember: {
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

  const createValidProjectMemberRecord = (overrides = {}) => ({
    id: validMemberId,
    organizationId: validOrgId,
    projectRole: ProjectRole.CONTRIBUTOR,
    project: {
      id: validProjectId,
      organizationId: validOrgId,
      deletedAt: null,
    },
    ...overrides,
  });

  await t.test('1. Valid project membership for LEAD allows access and attaches verified projectContext', async () => {
    const mockRecord = createValidProjectMemberRecord({ projectRole: ProjectRole.LEAD });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.ok(request.projectContext);
    assert.equal(request.projectContext.projectId, validProjectId);
    assert.equal(request.projectContext.organizationId, validOrgId);
    assert.equal(request.projectContext.projectMemberId, validMemberId);
    assert.equal(request.projectContext.projectRole, ProjectRole.LEAD);
    assert.ok(Object.isFrozen(request.projectContext));

    const { queriedWhere, queriedSelect } = prisma.getQueries();
    assert.deepEqual(queriedWhere, {
      uq_project_user: {
        projectId: validProjectId,
        userId: validUserId,
      },
      organizationId: validOrgId,
    });
    assert.ok(queriedSelect.id);
    assert.ok(queriedSelect.organizationId);
    assert.ok(queriedSelect.projectRole);
    assert.ok(queriedSelect.project);
  });

  await t.test('2. Valid project membership for CONTRIBUTOR allows access and attaches verified projectContext', async () => {
    const mockRecord = createValidProjectMemberRecord({ projectRole: ProjectRole.CONTRIBUTOR });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.ok(request.projectContext);
    assert.equal(request.projectContext.projectRole, ProjectRole.CONTRIBUTOR);
  });

  await t.test('3. Valid project membership for VIEWER allows access and attaches verified projectContext', async () => {
    const mockRecord = createValidProjectMemberRecord({ projectRole: ProjectRole.VIEWER });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.ok(request.projectContext);
    assert.equal(request.projectContext.projectRole, ProjectRole.VIEWER);
  });

  await t.test('4. Missing or malformed authenticated user rejects safely with 401 Unauthorized', async () => {
    const prisma = createMockPrismaService(createValidProjectMemberRecord());
    const invalidUserCases = [
      { user: undefined },
      { user: null },
      { user: {} },
      { user: { id: '' } },
      { user: { id: null } },
      { user: { id: 12345 } },
      { user: { id: 'not-a-uuid' } },
    ];

    for (const contextConfig of invalidUserCases) {
      const { context, reflector } = createMockExecutionContext(contextConfig);
      const guard = new ProjectTenantGuard(reflector, prisma);

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

  await t.test('5. Missing or malformed organization context rejects safely with 403 Forbidden', async () => {
    const prisma = createMockPrismaService(createValidProjectMemberRecord());
    const invalidOrgContextCases = [
      { orgContext: undefined },
      { orgContext: null },
      { orgContext: {} },
      { orgContext: { organizationId: '' } },
      { orgContext: { organizationId: null } },
      { orgContext: { organizationId: 12345 } },
      { orgContext: { organizationId: 'not-a-uuid' } },
    ];

    for (const contextConfig of invalidOrgContextCases) {
      const { context, reflector } = createMockExecutionContext(contextConfig);
      const guard = new ProjectTenantGuard(reflector, prisma);

      await assert.rejects(
        async () => {
          await guard.canActivate(context);
        },
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          assert.equal(err.getStatus(), 403);
          assert.equal(err.message, 'Organization context required.');
          return true;
        },
      );
    }

    assert.equal(prisma.getQueries().queriedWhere, null);
  });

  await t.test('6. Missing or malformed projectId route parameter is rejected with 404', async () => {
    const prisma = createMockPrismaService(createValidProjectMemberRecord());
    const invalidParamCases = [
      {},
      { projectId: '' },
      { projectId: '   ' },
      { projectId: 'not-a-valid-uuid' },
      { projectId: 12345 },
      { projectId: null },
      { projectId: undefined },
      { id: validProjectId }, // :id is NOT supported
    ];

    for (const params of invalidParamCases) {
      const { context, reflector } = createMockExecutionContext({ params });
      const guard = new ProjectTenantGuard(reflector, prisma);

      await assert.rejects(
        async () => {
          await guard.canActivate(context);
        },
        (err) => {
          assert.ok(err instanceof NotFoundException);
          assert.equal(err.getStatus(), 404);
          assert.equal(err.message, 'Project not found.');
          return true;
        },
      );
    }

    assert.equal(prisma.getQueries().queriedWhere, null);
  });

  await t.test('7. Missing project membership is rejected safely with 404 (non-disclosure)', async () => {
    const prisma = createMockPrismaService(null); // No record found
    const { context, reflector } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Project not found.');
        return true;
      },
    );
  });

  await t.test('8. Soft-deleted project is rejected with 404', async () => {
    const mockRecord = createValidProjectMemberRecord({
      project: {
        id: validProjectId,
        organizationId: validOrgId,
        deletedAt: new Date(),
      },
    });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Project not found.');
        return true;
      },
    );
  });

  await t.test('9. Project belonging to a different organization is rejected with 404', async () => {
    const otherOrgId = 'b0000000-0000-4000-8000-000000000002';
    const mockRecord = createValidProjectMemberRecord({
      organizationId: validOrgId,
      project: {
        id: validProjectId,
        organizationId: otherOrgId, // Project belongs to different org
        deletedAt: null,
      },
    });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Project not found.');
        return true;
      },
    );
  });

  await t.test('10. ProjectMember record belonging to a different organization is rejected with 404', async () => {
    const otherOrgId = 'b0000000-0000-4000-8000-000000000002';
    const mockRecord = createValidProjectMemberRecord({
      organizationId: otherOrgId, // Member belongs to different org
      project: {
        id: validProjectId,
        organizationId: validOrgId,
        deletedAt: null,
      },
    });
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, 'Project not found.');
        return true;
      },
    );
  });

  await t.test('11. Body-supplied or header-supplied project ID cannot override route parameter', async () => {
    const attackerProjectId = 'e0000000-0000-4000-8000-000000000099';
    const mockRecord = createValidProjectMemberRecord();
    const prisma = createMockPrismaService(mockRecord);

    const { context, reflector, request } = createMockExecutionContext({
      params: { projectId: validProjectId },
      body: { projectId: attackerProjectId, id: attackerProjectId },
      headers: { 'x-project-id': attackerProjectId },
    });

    const guard = new ProjectTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.equal(request.projectContext.projectId, validProjectId);
    assert.notEqual(request.projectContext.projectId, attackerProjectId);

    const { queriedWhere } = prisma.getQueries();
    assert.equal(queriedWhere.uq_project_user.projectId, validProjectId);
  });

  await t.test('12. @Public() route bypasses project membership check safely', async () => {
    const prisma = createMockPrismaService(createValidProjectMemberRecord());
    const { context, reflector, request } = createMockExecutionContext({
      user: undefined,
      orgContext: undefined,
      params: {},
      isPublic: true,
    });

    const guard = new ProjectTenantGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    assert.equal(request.projectContext, undefined); // Public route does not receive false projectContext
    assert.equal(prisma.getQueries().queriedWhere, null); // Query skipped
  });

  await t.test('13. Database connectivity failure bubbles up to exception filter', async () => {
    const connectivityError = new Prisma.PrismaClientKnownRequestError(
      'Can not reach database server at postgresql://postgres:pw@host',
      {
        code: 'P1001',
        clientVersion: '6.19.3',
      },
    );

    const prisma = createMockPrismaService(connectivityError);
    const { context, reflector } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);

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

  await t.test('14. Request context contains strictly verified fields and prevents unsafe mutation', async () => {
    const mockRecord = createValidProjectMemberRecord();
    const prisma = createMockPrismaService(mockRecord);
    const { context, reflector, request } = createMockExecutionContext();

    const guard = new ProjectTenantGuard(reflector, prisma);
    await guard.canActivate(context);

    assert.deepEqual(Object.keys(request.projectContext).sort(), [
      'organizationId',
      'projectId',
      'projectMemberId',
      'projectRole',
    ]);

    // Verifies immutability
    assert.throws(
      () => {
        'use strict';
        request.projectContext.projectId = 'mutated';
      },
      (err) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );
  });
});
