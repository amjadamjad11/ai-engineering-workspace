const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');
const {
  OrgMemberStatus,
  PrismaClient,
  UserStatus,
} = require('@prisma/client');
const { seedRbac } = require('../prisma/seed');
const { OrgTenantGuard } = require('../src/auth/guards/org-tenant.guard');
const {
  OrganizationsService,
} = require('../src/organizations/organizations.service');

test('OrganizationsModule — Disposable PostgreSQL Integration Suite', async (t) => {
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
    path.join(os.tmpdir(), 'pg_orgs_int_test_'),
  );
  const uniqueLogFile = path.join(uniqueDataDir, 'server.log');
  let initdbCompleted = false;
  let prisma = null;

  const runStage = (exe, args, options = {}) => {
    execFileSync(exe, args, {
      stdio: options.stdio || 'pipe',
      timeout: options.timeoutMs,
    });
  };

  try {
    runStage(
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
        'CREATE DATABASE orgs_test_db;',
      ],
      { timeoutMs: 30000 },
    );

    runStage(
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
        'orgs_test_db',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;',
      ],
      { timeoutMs: 30000 },
    );

    runStage(
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
        'orgs_test_db',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        MIGRATION_FILE,
      ],
      { timeoutMs: 45000 },
    );

    const dbUrl = `postgresql://postgres@${TEST_HOST}:${TEST_PORT}/orgs_test_db?schema=public`;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();
    await seedRbac(prisma);

    const service = new OrganizationsService(prisma);
    const orgTenantGuard = new OrgTenantGuard(new Reflector(), prisma);

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    await prisma.profile.createMany({
      data: [
        {
          id: userA,
          email: 'usera@test.local',
          fullName: 'User A',
          status: UserStatus.ACTIVE,
        },
        {
          id: userB,
          email: 'userb@test.local',
          fullName: 'User B',
          status: UserStatus.ACTIVE,
        },
      ],
    });

    let createdOrgId = null;

    await t.test('1. create() persists organization and enrolls creator as ACTIVE OWNER', async () => {
      const org = await service.create(userA, {
        name: 'Alpha Corp',
        slug: 'alpha-corp',
      });
      createdOrgId = org.id;
      assert.equal(org.name, 'Alpha Corp');
      assert.equal(org.slug, 'alpha-corp');
      assert.equal(org.createdById, userA);

      const member = await prisma.organizationMember.findUnique({
        where: { uq_org_member: { organizationId: org.id, userId: userA } },
        include: { role: true },
      });
      assert.ok(member);
      assert.equal(member.status, OrgMemberStatus.ACTIVE);
      assert.equal(member.role.name, 'OWNER');
    });

    await t.test('2. Duplicate slug throws 409 ConflictException and rolls back', async () => {
      await assert.rejects(
        () =>
          service.create(userB, {
            name: 'Alpha Duplicate',
            slug: 'alpha-corp',
          }),
        ConflictException,
      );
      const count = await prisma.organization.count({
        where: { slug: 'alpha-corp' },
      });
      assert.equal(count, 1);
    });

    await t.test('3. findAllForUser() isolates organizations per active user', async () => {
      const listA = await service.findAllForUser(userA);
      const listB = await service.findAllForUser(userB);
      assert.equal(listA.length, 1);
      assert.equal(listA[0].id, createdOrgId);
      assert.equal(listB.length, 0);
    });

    await t.test('4. update() updates name/logoUrl for OWNER and rejects non-OWNER/ADMIN', async () => {
      const reqA = { user: { id: userA }, params: { orgId: createdOrgId } };
      await orgTenantGuard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => reqA }),
      });

      const updated = await service.update(userA, reqA.orgContext, {
        name: 'Alpha AI Labs',
      });
      assert.equal(updated.name, 'Alpha AI Labs');

      // Enroll userB as MEMBER and verify 403 on update
      const memberRole = await prisma.role.findFirstOrThrow({
        where: { name: 'MEMBER', isSystemRole: true },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: createdOrgId,
          userId: userB,
          roleId: memberRole.id,
          status: OrgMemberStatus.ACTIVE,
        },
      });
      const reqB = { user: { id: userB }, params: { orgId: createdOrgId } };
      await orgTenantGuard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => reqB }),
      });
      await assert.rejects(
        () => service.update(userB, reqB.orgContext, { name: 'Hacked' }),
        ForbiddenException,
      );
    });

    await t.test('5. softDelete() sets deletedAt and blocks subsequent OrgTenantGuard access (404)', async () => {
      const reqA = { user: { id: userA }, params: { orgId: createdOrgId } };
      await orgTenantGuard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => reqA }),
      });

      await service.softDelete(userA, reqA.orgContext);

      await assert.rejects(
        () =>
          orgTenantGuard.canActivate({
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({ getRequest: () => reqA }),
          }),
        NotFoundException,
      );

      const listA = await service.findAllForUser(userA);
      assert.equal(listA.length, 0);
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
