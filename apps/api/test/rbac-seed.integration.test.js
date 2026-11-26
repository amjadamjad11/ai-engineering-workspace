const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { PrismaClient } = require('@prisma/client');
const { seedRbac } = require('../prisma/seed');
const { PermissionCode } = require('@ai-workspace/shared');

test('RBAC Seed Infrastructure Suite — Disposable Local PostgreSQL Integration', async (t) => {
  const PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const PSQL_EXE = path.join(PG_BIN_DIR, 'psql.exe');
  const PG_CTL_EXE = path.join(PG_BIN_DIR, 'pg_ctl.exe');
  const INITDB_EXE = path.join(PG_BIN_DIR, 'initdb.exe');
  const TEST_HOST = '127.0.0.1';
  const MIGRATION_FILE = path.resolve(__dirname, '../prisma/migrations/20261107120000_init/migration.sql');

  // Verify binaries
  if (!fs.existsSync(PSQL_EXE) || !fs.existsSync(PG_CTL_EXE) || !fs.existsSync(INITDB_EXE)) {
    t.diagnostic('PostgreSQL 18 binaries not found. Skipping disposable integration tests.');
    return;
  }

  // Get free port
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
  const uniqueDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg_rbac_seed_test_'));
  const uniqueLogFile = path.join(uniqueDataDir, 'server.log');
  let initdbCompleted = false;
  let prisma = null;
  let prisma2 = null;

  const runStage = (stageName, exe, args, options = {}) => {
    const startMs = Date.now();
    process.stderr.write(`[rbac-seed-int] START ${stageName}\n`);
    try {
      execFileSync(exe, args, {
        stdio: options.stdio || 'pipe',
        timeout: options.timeoutMs,
      });
      const elapsed = Date.now() - startMs;
      process.stderr.write(`[rbac-seed-int] DONE  ${stageName} (${elapsed}ms)\n`);
    } catch (err) {
      const elapsed = Date.now() - startMs;
      const statusInfo = err.status !== undefined ? `status=${err.status}` : `signal=${err.signal || 'unknown'}`;
      process.stderr.write(
        `[rbac-seed-int] FAIL  ${stageName} (${elapsed}ms, ${statusInfo}) log=${uniqueLogFile}\n`,
      );
      throw err;
    }
  };

  try {
    // 1. Initialize cluster (30s timeout)
    runStage(
      'initdb',
      INITDB_EXE,
      ['-D', uniqueDataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'],
      { timeoutMs: 30000 },
    );
    initdbCompleted = true;

    // 2. Start server (45s timeout, stdio: 'ignore' to prevent Windows pipe handle inheritance hang)
    runStage(
      'pg_ctl_start',
      PG_CTL_EXE,
      [
        '-D', uniqueDataDir,
        '-l', uniqueLogFile,
        '-w',
        '-o', `-p ${TEST_PORT} -h ${TEST_HOST} -c listen_addresses=${TEST_HOST}`,
        'start',
      ],
      { stdio: 'ignore', timeoutMs: 45000 },
    );

    // 3. Create database, provision required Supabase-compatible roles, and apply migration (30s timeout each)
    runStage(
      'psql_create_db',
      PSQL_EXE,
      [
        '-X', '-w', '-h', TEST_HOST, '-p', String(TEST_PORT),
        '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-c', 'CREATE DATABASE rbac_test_db;',
      ],
      { timeoutMs: 30000 },
    );

    runStage(
      'psql_provision_roles',
      PSQL_EXE,
      [
        '-X', '-w', '-h', TEST_HOST, '-p', String(TEST_PORT),
        '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-c',
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;",
      ],
      { timeoutMs: 30000 },
    );

    runStage(
      'psql_apply_migration',
      PSQL_EXE,
      [
        '-X', '-w', '-h', TEST_HOST, '-p', String(TEST_PORT),
        '-U', 'postgres', '-d', 'rbac_test_db', '-v', 'ON_ERROR_STOP=1',
        '-f', MIGRATION_FILE,
      ],
      { timeoutMs: 30000 },
    );

    // Connect Prisma Client to disposable DB
    const databaseUrl = `postgresql://postgres@${TEST_HOST}:${TEST_PORT}/rbac_test_db?schema=public`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    process.stderr.write('[rbac-seed-int] START prisma_connect\n');
    const connectStart = Date.now();
    await prisma.$connect();
    process.stderr.write(`[rbac-seed-int] DONE  prisma_connect (${Date.now() - connectStart}ms)\n`);

    // Test 1: First seed execution
    const result1 = await seedRbac(prisma);
    assert.equal(result1.rolesUpserted, 3, 'Should upsert 3 canonical roles');
    assert.equal(result1.permissionsUpserted, 2, 'Should upsert 2 permissions');
    assert.equal(result1.mappingsSynchronized, 4, 'Should synchronize 4 mappings');

    const roles = await prisma.role.findMany({
      where: { isSystemRole: true, organizationId: null },
    });
    assert.equal(roles.length, 3);
    const names = roles.map((r) => r.name).sort();
    assert.deepEqual(names, ['ADMIN', 'MEMBER', 'OWNER']);

    const perms = await prisma.permission.findMany();
    assert.equal(perms.length, 2);

    const mappings = await prisma.rolePermission.findMany({
      include: { role: true, permission: true },
    });
    assert.equal(mappings.length, 4);

    const ownerMappings = mappings.filter((m) => m.role.name === 'OWNER');
    const adminMappings = mappings.filter((m) => m.role.name === 'ADMIN');
    const memberMappings = mappings.filter((m) => m.role.name === 'MEMBER');

    assert.equal(ownerMappings.length, 2);
    assert.equal(adminMappings.length, 2);
    assert.equal(memberMappings.length, 0);

    // Test 2: Idempotency (repeated execution)
    const result2 = await seedRbac(prisma);
    assert.equal(result2.rolesUpserted, 3);
    assert.equal(result2.permissionsUpserted, 2);
    assert.equal(result2.mappingsSynchronized, 4);

    const rolesAfterSecondRun = await prisma.role.findMany({
      where: { isSystemRole: true, organizationId: null },
    });
    assert.equal(rolesAfterSecondRun.length, 3);

    const mappingsAfterSecondRun = await prisma.rolePermission.findMany();
    assert.equal(mappingsAfterSecondRun.length, 4);

    // Test 3: Custom organization roles and mappings remain untouched
    const org = await prisma.organization.create({
      data: {
        name: 'Custom Role Org',
        slug: 'custom-role-org',
      },
    });

    const customRole = await prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'CUSTOM_DEV',
        isSystemRole: false,
      },
    });

    const readAllPerm = await prisma.permission.findUnique({
      where: { code: PermissionCode.PROJECTS_READ_ALL },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: customRole.id,
        permissionId: readAllPerm.id,
      },
    });

    await seedRbac(prisma);

    const preservedCustomRole = await prisma.role.findUnique({
      where: { id: customRole.id },
    });
    assert.ok(preservedCustomRole);

    const customMappings = await prisma.rolePermission.findMany({
      where: { roleId: customRole.id },
    });
    assert.equal(customMappings.length, 1);
    assert.equal(customMappings[0].permissionId, readAllPerm.id);

    await prisma.organization.delete({ where: { id: org.id } });

    // Test 4: Non-canonical system roles and mappings remain untouched
    const nonCanonicalRole = await prisma.role.create({
      data: {
        name: 'SYSTEM_AUDITOR',
        isSystemRole: true,
        organizationId: null,
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: nonCanonicalRole.id,
        permissionId: readAllPerm.id,
      },
    });

    await seedRbac(prisma);

    const preservedRole = await prisma.role.findUnique({
      where: { id: nonCanonicalRole.id },
    });
    assert.ok(preservedRole);

    const preservedMappings = await prisma.rolePermission.findMany({
      where: { roleId: nonCanonicalRole.id },
    });
    assert.equal(preservedMappings.length, 1);
    assert.equal(preservedMappings[0].permissionId, readAllPerm.id);

    await prisma.role.delete({ where: { id: nonCanonicalRole.id } });

    // Test 5: Concurrent seed execution serialized safely by advisory lock
    prisma2 = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    await prisma2.$connect();

    const [res1, res2] = await Promise.all([
      seedRbac(prisma),
      seedRbac(prisma2),
    ]);

    assert.equal(res1.rolesUpserted, 3);
    assert.equal(res2.rolesUpserted, 3);

    const finalMappings = await prisma.rolePermission.findMany();
    assert.equal(finalMappings.length, 4);

  } finally {
    if (prisma2) {
      try {
        await prisma2.$disconnect();
      } catch (disconnectErr) {
        process.stderr.write(`[rbac-seed-int] WARN prisma2 disconnect failed: ${disconnectErr.message}\n`);
      }
    }
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch (disconnectErr) {
        process.stderr.write(`[rbac-seed-int] WARN prisma disconnect failed: ${disconnectErr.message}\n`);
      }
    }
    let canDeleteDir = !initdbCompleted;
    if (initdbCompleted && uniqueDataDir && fs.existsSync(uniqueDataDir)) {
      let isRunning = false;
      let statusConfirmedStopped = false;
      try {
        execFileSync(PG_CTL_EXE, ['status', '-D', uniqueDataDir], {
          stdio: 'pipe',
          timeout: 15000,
        });
        isRunning = true;
      } catch (statusErr) {
        if (statusErr.status === 3) {
          // pg_ctl status exits with 3 when no server is running
          statusConfirmedStopped = true;
        } else {
          const info = statusErr.status !== undefined ? `status=${statusErr.status}` : `signal=${statusErr.signal || 'unknown'}`;
          process.stderr.write(
            `[rbac-seed-int] WARN pg_ctl status ambiguous (${info}); preserving temp dir ${uniqueDataDir}\n`,
          );
        }
      }

      if (isRunning) {
        try {
          runStage(
            'pg_ctl_stop',
            PG_CTL_EXE,
            ['-D', uniqueDataDir, '-m', 'fast', '-w', 'stop'],
            { timeoutMs: 45000 },
          );
          canDeleteDir = true;
        } catch (stopErr) {
          process.stderr.write(
            `[rbac-seed-int] WARN pg_ctl_stop failed; preserving temp dir ${uniqueDataDir}\n`,
          );
        }
      } else if (statusConfirmedStopped) {
        canDeleteDir = true;
      }
    }
    if (canDeleteDir && uniqueDataDir && fs.existsSync(uniqueDataDir)) {
      try {
        fs.rmSync(uniqueDataDir, { recursive: true, force: true });
      } catch (rmErr) {
        process.stderr.write(
          `[rbac-seed-int] WARN failed to remove temp dir ${uniqueDataDir}: ${rmErr.message}\n`,
        );
      }
    }
  }
});
