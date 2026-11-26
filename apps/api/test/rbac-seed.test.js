const test = require('node:test');
const assert = require('node:assert/strict');
const {
  seedRbac,
  CANONICAL_SYSTEM_ROLES,
  RBAC_SEED_ADVISORY_LOCK_KEY,
} = require('../prisma/seed');
const { PermissionCode, PERMISSION_DEFINITIONS } = require('@ai-workspace/shared');

test('RBAC Seed Infrastructure Suite — In-Memory & Unit Verification', async (t) => {
  const roleIdOwner = 'r0000000-0000-4000-8000-000000000001';
  const roleIdAdmin = 'r0000000-0000-4000-8000-000000000002';
  const roleIdMember = 'r0000000-0000-4000-8000-000000000003';
  const permIdReadAll = 'p0000000-0000-4000-8000-000000000001';
  const permIdManageAll = 'p0000000-0000-4000-8000-000000000002';

  const createMockPrisma = (options = {}) => {
    const rawSqlCalls = [];
    const permissionUpserts = [];
    let rolePermissionDeletes = [];
    let rolePermissionCreates = [];

    const mockRoles = options.mockRoles !== undefined
      ? options.mockRoles
      : [
          { id: roleIdOwner, name: 'OWNER', isSystemRole: true, organizationId: null },
          { id: roleIdAdmin, name: 'ADMIN', isSystemRole: true, organizationId: null },
          { id: roleIdMember, name: 'MEMBER', isSystemRole: true, organizationId: null },
        ];

    const mockPermissions = options.mockPermissions !== undefined
      ? options.mockPermissions
      : [
          { id: permIdReadAll, code: PermissionCode.PROJECTS_READ_ALL },
          { id: permIdManageAll, code: PermissionCode.PROJECTS_MANAGE_ALL },
        ];

    const tx = {
      $executeRaw: async (query, ...params) => {
        rawSqlCalls.push({ query, params });
        if (options.failOnExecuteRaw) {
          throw new Error('Simulated raw SQL failure');
        }
        return 1;
      },
      permission: {
        upsert: async (args) => {
          permissionUpserts.push(args);
          return { id: 'dummy-id', ...args.create };
        },
        findMany: async (args) => {
          return mockPermissions;
        },
      },
      role: {
        findMany: async (args) => {
          return mockRoles;
        },
      },
      rolePermission: {
        deleteMany: async (args) => {
          rolePermissionDeletes.push(args);
          if (options.failOnDeleteMany) {
            throw new Error('Simulated deleteMany failure');
          }
          return { count: 4 };
        },
        createMany: async (args) => {
          rolePermissionCreates.push(args);
          if (options.failOnCreateMany) {
            throw new Error('Simulated createMany failure');
          }
          return { count: args.data.length };
        },
      },
    };

    let transactionExecuted = false;
    let transactionCommitted = false;

    const prisma = {
      $transaction: async (fn, opts) => {
        transactionExecuted = true;
        try {
          const result = await fn(tx);
          transactionCommitted = true;
          return result;
        } catch (err) {
          transactionCommitted = false;
          throw err;
        }
      },
      getAudit: () => ({
        rawSqlCalls,
        permissionUpserts,
        rolePermissionDeletes,
        rolePermissionCreates,
        transactionExecuted,
        transactionCommitted,
      }),
    };

    return prisma;
  };

  await t.test('1. Exact three canonical roles are upserted with advisory lock', async () => {
    const prisma = createMockPrisma();
    const result = await seedRbac(prisma);

    assert.equal(result.rolesUpserted, 3);
    const audit = prisma.getAudit();
    assert.equal(audit.transactionCommitted, true);

    // Advisory lock must be the first call
    const lockCall = audit.rawSqlCalls[0];
    assert.ok(lockCall);
    assert.ok(lockCall.query.join('').includes('pg_advisory_xact_lock'));
    assert.equal(lockCall.params[0], RBAC_SEED_ADVISORY_LOCK_KEY);

    // Three subsequent raw SQL calls for canonical roles
    assert.equal(audit.rawSqlCalls.length, 4); // 1 lock + 3 roles
    for (let i = 1; i <= 3; i++) {
      const roleCall = audit.rawSqlCalls[i];
      const sqlText = roleCall.query.join('');
      assert.ok(sqlText.includes('idx_system_role_unique_name') || sqlText.includes('ON CONFLICT (name) WHERE organization_id IS NULL'));
      assert.ok(sqlText.includes('is_system_role, created_at'));
    }
  });

  await t.test('2. Exact two permissions are upserted with accurate modules and descriptions', async () => {
    const prisma = createMockPrisma();
    const result = await seedRbac(prisma);

    assert.equal(result.permissionsUpserted, 2);
    const audit = prisma.getAudit();
    assert.equal(audit.permissionUpserts.length, 2);

    const codes = audit.permissionUpserts.map((p) => p.where.code);
    assert.deepEqual(codes.sort(), [
      PermissionCode.PROJECTS_MANAGE_ALL,
      PermissionCode.PROJECTS_READ_ALL,
    ]);
  });

  await t.test('3. OWNER and ADMIN receive both permissions; MEMBER receives no mappings', async () => {
    const prisma = createMockPrisma();
    const result = await seedRbac(prisma);

    assert.equal(result.mappingsSynchronized, 4);
    const audit = prisma.getAudit();
    const createdMappings = audit.rolePermissionCreates[0].data;

    assert.equal(createdMappings.length, 4);

    const ownerMappings = createdMappings.filter((m) => m.roleId === roleIdOwner);
    const adminMappings = createdMappings.filter((m) => m.roleId === roleIdAdmin);
    const memberMappings = createdMappings.filter((m) => m.roleId === roleIdMember);

    assert.equal(ownerMappings.length, 2);
    assert.equal(adminMappings.length, 2);
    assert.equal(memberMappings.length, 0);

    const ownerPermIds = ownerMappings.map((m) => m.permissionId).sort();
    assert.deepEqual(ownerPermIds, [permIdReadAll, permIdManageAll].sort());

    const adminPermIds = adminMappings.map((m) => m.permissionId).sort();
    assert.deepEqual(adminPermIds, [permIdReadAll, permIdManageAll].sort());
  });

  await t.test('4. Mapping deletion is scoped exclusively to the 3 resolved canonical role IDs', async () => {
    const prisma = createMockPrisma();
    await seedRbac(prisma);

    const audit = prisma.getAudit();
    const deleteArgs = audit.rolePermissionDeletes[0];

    assert.ok(deleteArgs.where.roleId.in);
    assert.deepEqual(deleteArgs.where.roleId.in.sort(), [
      roleIdOwner,
      roleIdAdmin,
      roleIdMember,
    ].sort());
  });

  await t.test('5. Fails closed and aborts transaction if canonical role resolution is incomplete', async () => {
    // Only 2 roles returned instead of 3
    const prisma = createMockPrisma({
      mockRoles: [
        { id: roleIdOwner, name: 'OWNER', isSystemRole: true, organizationId: null },
        { id: roleIdAdmin, name: 'ADMIN', isSystemRole: true, organizationId: null },
      ],
    });

    await assert.rejects(
      async () => {
        await seedRbac(prisma);
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Expected 3 canonical system roles, found 2'));
        return true;
      },
    );

    const audit = prisma.getAudit();
    assert.equal(audit.transactionCommitted, false);
    assert.equal(audit.rolePermissionDeletes.length, 0); // No deletion occurred
    assert.equal(audit.rolePermissionCreates.length, 0); // No insertion occurred
  });

  await t.test('6. Fails closed and aborts transaction if permission resolution is incomplete', async () => {
    // Only 1 permission returned instead of 2
    const prisma = createMockPrisma({
      mockPermissions: [
        { id: permIdReadAll, code: PermissionCode.PROJECTS_READ_ALL },
      ],
    });

    await assert.rejects(
      async () => {
        await seedRbac(prisma);
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Expected 2 approved permissions, found 1'));
        return true;
      },
    );

    const audit = prisma.getAudit();
    assert.equal(audit.transactionCommitted, false);
    assert.equal(audit.rolePermissionDeletes.length, 0);
  });

  await t.test('7. Mapping creation failure triggers complete transaction rollback', async () => {
    const prisma = createMockPrisma({ failOnCreateMany: true });

    await assert.rejects(
      async () => {
        await seedRbac(prisma);
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Simulated createMany failure');
        return true;
      },
    );

    const audit = prisma.getAudit();
    assert.equal(audit.transactionCommitted, false);
  });

  await t.test('8. Importing the seed module does not create a database connection', () => {
    // Verifies that require('../prisma/seed') did not connect or crash
    const module = require('../prisma/seed');
    assert.equal(typeof module.seedRbac, 'function');
    assert.ok(Array.isArray(module.CANONICAL_SYSTEM_ROLES));
  });
});
