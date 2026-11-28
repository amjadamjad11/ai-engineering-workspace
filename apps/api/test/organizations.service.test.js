const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} = require('@nestjs/common');
const { OrgMemberStatus, Prisma } = require('@prisma/client');
const {
  OrganizationsService,
} = require('../src/organizations/organizations.service');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

function makeOrgRecord(overrides = {}) {
  const now = new Date('2026-11-28T10:00:00.000Z');
  return {
    id: ORG_ID,
    name: 'Acme Engineering',
    slug: 'acme-engineering',
    logoUrl: null,
    billingPlan: 'FREE',
    createdById: USER_ID,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

test('OrganizationsService — Unit Suite', async (t) => {
  await t.test('1. create() runs in transaction, looks up OWNER role, creates org and ACTIVE member', async () => {
    let memberCreateArgs = null;
    const prisma = {
      $transaction: async (cb) =>
        cb({
          role: {
            findFirst: async () => ({ id: ROLE_ID }),
          },
          organization: {
            create: async () => makeOrgRecord(),
          },
          organizationMember: {
            create: async (args) => {
              memberCreateArgs = args;
              return { id: MEMBER_ID };
            },
          },
        }),
    };

    const service = new OrganizationsService(prisma);
    const result = await service.create(USER_ID, {
      name: 'Acme Engineering',
      slug: 'acme-engineering',
    });

    assert.equal(result.id, ORG_ID);
    assert.equal(result.slug, 'acme-engineering');
    assert.equal(memberCreateArgs.data.userId, USER_ID);
    assert.equal(memberCreateArgs.data.roleId, ROLE_ID);
    assert.equal(memberCreateArgs.data.status, OrgMemberStatus.ACTIVE);
    assert.ok(memberCreateArgs.data.joinedAt instanceof Date);
  });

  await t.test('2. create() fails safely with 500 if canonical OWNER role is missing', async () => {
    const prisma = {
      $transaction: async (cb) =>
        cb({
          role: { findFirst: async () => null },
        }),
    };

    const service = new OrganizationsService(prisma);
    await assert.rejects(
      () =>
        service.create(USER_ID, {
          name: 'Acme Engineering',
          slug: 'acme-engineering',
        }),
      InternalServerErrorException,
    );
  });

  await t.test('3. create() maps Prisma P2002 duplicate slug to 409 ConflictException', async () => {
    const prisma = {
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.0.1',
        });
      },
    };

    const service = new OrganizationsService(prisma);
    await assert.rejects(
      () =>
        service.create(USER_ID, {
          name: 'Acme Engineering',
          slug: 'acme-engineering',
        }),
      ConflictException,
    );
  });

  await t.test('4. findAllForUser() filters by deletedAt: null and ACTIVE membership', async () => {
    let capturedWhere = null;
    const prisma = {
      organization: {
        findMany: async (args) => {
          capturedWhere = args.where;
          return [makeOrgRecord()];
        },
      },
    };

    const service = new OrganizationsService(prisma);
    const list = await service.findAllForUser(USER_ID);
    assert.equal(list.length, 1);
    assert.equal(capturedWhere.deletedAt, null);
    assert.equal(capturedWhere.members.some.userId, USER_ID);
    assert.equal(capturedWhere.members.some.status, OrgMemberStatus.ACTIVE);
  });

  await t.test('5. update() rejects empty DTO with 400 BadRequestException', async () => {
    const service = new OrganizationsService({});
    await assert.rejects(
      () =>
        service.update(
          USER_ID,
          { organizationId: ORG_ID, organizationMemberId: MEMBER_ID },
          {},
        ),
      BadRequestException,
    );
  });

  await t.test('6. update() rejects MEMBER role with 403 ForbiddenException', async () => {
    const prisma = {
      organizationMember: {
        findUnique: async () => ({
          id: MEMBER_ID,
          status: OrgMemberStatus.ACTIVE,
          role: { name: 'MEMBER', isSystemRole: true, organizationId: null },
        }),
      },
    };

    const service = new OrganizationsService(prisma);
    await assert.rejects(
      () =>
        service.update(
          USER_ID,
          { organizationId: ORG_ID, organizationMemberId: MEMBER_ID },
          { name: 'New Name' },
        ),
      ForbiddenException,
    );
  });

  await t.test('7. softDelete() rejects ADMIN with 403 and allows OWNER', async () => {
    const adminPrisma = {
      organizationMember: {
        findUnique: async () => ({
          id: MEMBER_ID,
          status: OrgMemberStatus.ACTIVE,
          role: { name: 'ADMIN', isSystemRole: true, organizationId: null },
        }),
      },
    };
    const adminService = new OrganizationsService(adminPrisma);
    await assert.rejects(
      () =>
        adminService.softDelete(USER_ID, {
          organizationId: ORG_ID,
          organizationMemberId: MEMBER_ID,
        }),
      ForbiddenException,
    );

    const ownerPrisma = {
      organizationMember: {
        findUnique: async () => ({
          id: MEMBER_ID,
          status: OrgMemberStatus.ACTIVE,
          role: { name: 'OWNER', isSystemRole: true, organizationId: null },
        }),
      },
      organization: {
        updateMany: async () => ({ count: 0 }),
      },
    };
    const ownerService = new OrganizationsService(ownerPrisma);
    await assert.rejects(
      () =>
        ownerService.softDelete(USER_ID, {
          organizationId: ORG_ID,
          organizationMemberId: MEMBER_ID,
        }),
      NotFoundException,
    );
  });
});
