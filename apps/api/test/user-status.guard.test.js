const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UnauthorizedException,
  ForbiddenException,
} = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const { Prisma, UserStatus } = require('@prisma/client');
const { UserStatusGuard } = require('../dist/auth/guards/user-status.guard');
const { IS_PUBLIC_KEY } = require('../dist/auth/decorators/public.decorator');

test('UserStatusGuard — Account Active Status Verification Suite', async (t) => {
  const createMockExecutionContext = ({ user = undefined, isPublic = false } = {}) => {
    const request = { user };
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

  const createMockPrismaService = (profileResult) => {
    let queriedWhere = null;
    let queriedSelect = null;

    const prisma = {
      profile: {
        findUnique: async (args) => {
          queriedWhere = args.where;
          queriedSelect = args.select;
          if (profileResult instanceof Error) {
            throw profileResult;
          }
          return profileResult;
        },
      },
      getQueries: () => ({ queriedWhere, queriedSelect }),
    };

    return prisma;
  };

  await t.test('1. ACTIVE profile allows access', async () => {
    const validUserId = '123e4567-e89b-12d3-a456-426614174000';
    const prisma = createMockPrismaService({ status: UserStatus.ACTIVE });
    const { context, reflector } = createMockExecutionContext({
      user: { id: validUserId },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    const { queriedWhere, queriedSelect } = prisma.getQueries();
    assert.deepEqual(queriedWhere, { id: validUserId });
    assert.deepEqual(queriedSelect, { status: true });
  });

  await t.test('2. SUSPENDED profile is rejected with safe 403 Forbidden', async () => {
    const validUserId = '123e4567-e89b-12d3-a456-426614174000';
    const prisma = createMockPrismaService({ status: UserStatus.SUSPENDED });
    const { context, reflector } = createMockExecutionContext({
      user: { id: validUserId },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        assert.equal(err.message, 'User account is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('3. INACTIVE profile is rejected with safe 403 Forbidden', async () => {
    const validUserId = '123e4567-e89b-12d3-a456-426614174000';
    const prisma = createMockPrismaService({ status: UserStatus.INACTIVE });
    const { context, reflector } = createMockExecutionContext({
      user: { id: validUserId },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        assert.equal(err.message, 'User account is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('4. Missing profile in database is rejected with identical safe 403 Forbidden', async () => {
    const validUserId = '123e4567-e89b-12d3-a456-426614174000';
    const prisma = createMockPrismaService(null); // No record found
    const { context, reflector } = createMockExecutionContext({
      user: { id: validUserId },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);

    await assert.rejects(
      async () => {
        await guard.canActivate(context);
      },
      (err) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        // Ensure same uniform message is returned — does not disclose existence vs non-existence
        assert.equal(err.message, 'User account is inactive or unauthorized.');
        return true;
      },
    );
  });

  await t.test('5. Missing or invalid request.user rejects safely with 401 Unauthorized', async () => {
    const prisma = createMockPrismaService({ status: UserStatus.ACTIVE });

    const invalidUserCases = [
      undefined,
      null,
      {},
      { id: '' },
      { id: null },
      { id: 12345 },
    ];

    for (const invalidUser of invalidUserCases) {
      const { context, reflector } = createMockExecutionContext({
        user: invalidUser,
        isPublic: false,
      });

      const guard = new UserStatusGuard(reflector, prisma);

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

    // Ensure database was never queried when user was missing or invalid
    const { queriedWhere } = prisma.getQueries();
    assert.equal(queriedWhere, null);
  });

  await t.test('6. @Public() route bypasses profile database lookup completely', async () => {
    const prisma = createMockPrismaService({ status: UserStatus.SUSPENDED }); // Even if DB had suspended
    const { context, reflector } = createMockExecutionContext({
      user: undefined, // Even if user is unauthenticated
      isPublic: true,
    });

    const guard = new UserStatusGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    // Database query was skipped
    const { queriedWhere } = prisma.getQueries();
    assert.equal(queriedWhere, null);
  });

  await t.test('7. Prisma connectivity failure bubbles up to exception filter (never granted)', async () => {
    const connectivityError = new Prisma.PrismaClientKnownRequestError(
      'Database connection failed at postgresql://postgres:pw@host',
      {
        code: 'P1001',
        clientVersion: '6.19.3',
      },
    );

    const prisma = createMockPrismaService(connectivityError);
    const { context, reflector } = createMockExecutionContext({
      user: { id: '123e4567-e89b-12d3-a456-426614174000' },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);

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

  await t.test('8. Zero exposure: does not expose sensitive user metadata or internal query AST', async () => {
    const validUserId = '123e4567-e89b-12d3-a456-426614174000';
    const prisma = createMockPrismaService({ status: UserStatus.ACTIVE });
    const { context, reflector } = createMockExecutionContext({
      user: {
        id: validUserId,
        email: 'user@example.com',
        userMetadata: { ssn: '000-00-0000', secret: 'sensitive' },
      },
      isPublic: false,
    });

    const guard = new UserStatusGuard(reflector, prisma);
    const result = await guard.canActivate(context);

    assert.equal(result, true);
    const { queriedSelect } = prisma.getQueries();
    // Confirms query strictly requests { status: true }, no PII or extraneous fields
    assert.deepEqual(queriedSelect, { status: true });
  });
});
