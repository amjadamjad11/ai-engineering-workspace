const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
} = require('jose');
const {
  UnauthorizedException,
  ServiceUnavailableException,
  InternalServerErrorException,
} = require('@nestjs/common');
const { Reflector } = require('@nestjs/core');

const { AuthService } = require('../dist/auth/auth.service');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard');

test('AuthModule — Supabase ES256 JWT Authentication Suite', async (t) => {
  const mockSupabaseUrl = 'https://test-project.supabase.co';
  const expectedIssuer = `${mockSupabaseUrl}/auth/v1`;
  const expectedAudience = 'authenticated';
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  // Generate ephemeral P-256 keypair
  const validKeyPair = await generateKeyPair('ES256', { extractable: true });
  const validJwk = await exportJWK(validKeyPair.publicKey);
  validJwk.kid = 'test-key-id-1';
  validJwk.alg = 'ES256';
  validJwk.use = 'sig';

  const localJwkSet = createLocalJWKSet({
    keys: [validJwk],
  });

  const createConfigService = (supabaseUrl = mockSupabaseUrl) => ({
    get: (key) => (key === 'SUPABASE_URL' ? supabaseUrl : undefined),
  });

  const createToken = async (payload, options = {}) => {
    const key = options.key || validKeyPair.privateKey;
    const alg = options.alg || 'ES256';
    const kid = options.kid || validJwk.kid;

    const jwt = new SignJWT(payload).setProtectedHeader({ alg, kid });
    jwt.setIssuer(options.issuer !== undefined ? options.issuer : expectedIssuer);
    jwt.setAudience(options.audience !== undefined ? options.audience : expectedAudience);
    jwt.setSubject(options.subject !== undefined ? options.subject : validUuid);
    jwt.setExpirationTime(options.expiration !== undefined ? options.expiration : '1h');
    jwt.setIssuedAt();
    return await jwt.sign(key);
  };

  const createMockExecutionContext = (headers = {}, isPublic = false) => {
    const request = { headers, user: undefined };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const mockReflector = {
      getAllAndOverride: () => isPublic,
    };
    return { context, request, reflector: mockReflector };
  };

  await t.test('1. Valid ES256 token verification and guard attachment', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);
    const guard = new JwtAuthGuard(new Reflector(), authService);

    const token = await createToken({
      email: 'engineer@example.com',
      role: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Test Engineer' },
    });

    const user = await authService.verifyToken(token);
    assert.equal(user.id, validUuid);
    assert.equal(user.email, 'engineer@example.com');
    assert.equal(user.role, 'authenticated');
    assert.deepEqual(user.appMetadata, { provider: 'email' });
    assert.deepEqual(user.userMetadata, { full_name: 'Test Engineer' });

    const { context, request, reflector } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });
    const guarded = new JwtAuthGuard(reflector, authService);
    const result = await guarded.canActivate(context);
    assert.equal(result, true);
    assert.deepEqual(request.user, user);
  });

  await t.test('2. Reject invalid signature (untrusted P-256 key)', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const untrustedKeyPair = await generateKeyPair('ES256');
    const token = await createToken(
      { email: 'attacker@example.com' },
      { key: untrustedKeyPair.privateKey },
    );

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('3. Reject expired token', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken(
      { email: 'expired@example.com' },
      { expiration: '-10s' },
    );

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('4. Reject wrong issuer', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken(
      { email: 'user@example.com' },
      { issuer: 'https://evil-issuer.supabase.co/auth/v1' },
    );

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('5. Reject wrong audience', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken(
      { email: 'user@example.com' },
      { audience: 'anon' },
    );

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('6. Reject unsupported algorithm (HS256 HMAC)', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const secret = new TextEncoder().encode('super-secret-hmac-key-at-least-32-chars-long');
    const token = await new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256', kid: validJwk.kid })
      .setIssuer(expectedIssuer)
      .setAudience(expectedAudience)
      .setSubject(validUuid)
      .setExpirationTime('1h')
      .sign(secret);

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('7. Reject invalid UUID subject', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken(
      { email: 'user@example.com' },
      { subject: 'not-a-valid-uuid' },
    );

    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) =>
        err instanceof UnauthorizedException &&
        err.message === 'Invalid subject claim in token.',
    );
  });

  await t.test('8. Reject missing/malformed Bearer token in guard', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    // Missing
    const { context: ctx1, reflector: ref1 } = createMockExecutionContext({});
    await assert.rejects(
      async () => await new JwtAuthGuard(ref1, authService).canActivate(ctx1),
      (err) => err instanceof UnauthorizedException,
    );

    // Basic auth
    const { context: ctx2, reflector: ref2 } = createMockExecutionContext({
      authorization: 'Basic dXNlcjpwYXNz',
    });
    await assert.rejects(
      async () => await new JwtAuthGuard(ref2, authService).canActivate(ctx2),
      (err) => err instanceof UnauthorizedException,
    );

    // Empty bearer
    const { context: ctx3, reflector: ref3 } = createMockExecutionContext({
      authorization: 'Bearer ',
    });
    await assert.rejects(
      async () => await new JwtAuthGuard(ref3, authService).canActivate(ctx3),
      (err) => err instanceof UnauthorizedException,
    );

    // Extra trailing token rejected
    const { context: ctx4, reflector: ref4 } = createMockExecutionContext({
      authorization: 'Bearer valid.jwt.token extra-token',
    });
    await assert.rejects(
      async () => await new JwtAuthGuard(ref4, authService).canActivate(ctx4),
      (err) => err instanceof UnauthorizedException,
    );

    // Duplicate Authorization header (array) rejected safely
    const { context: ctx5, reflector: ref5 } = createMockExecutionContext({
      authorization: ['Bearer token1', 'Bearer token2'],
    });
    await assert.rejects(
      async () => await new JwtAuthGuard(ref5, authService).canActivate(ctx5),
      (err) => err instanceof UnauthorizedException,
    );
  });

  await t.test('8b. Accept Bearer token with whitespace variants and case-insensitivity', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken({
      email: 'whitespace@example.com',
    });

    // Multiple spaces
    const { context: ctx1, request: req1, reflector: ref1 } = createMockExecutionContext({
      authorization: `Bearer    ${token}`,
    });
    const res1 = await new JwtAuthGuard(ref1, authService).canActivate(ctx1);
    assert.equal(res1, true);
    assert.equal(req1.user.email, 'whitespace@example.com');

    // Tab whitespace
    const { context: ctx2, request: req2, reflector: ref2 } = createMockExecutionContext({
      authorization: `Bearer\t\t${token}`,
    });
    const res2 = await new JwtAuthGuard(ref2, authService).canActivate(ctx2);
    assert.equal(res2, true);
    assert.equal(req2.user.email, 'whitespace@example.com');

    // Case-insensitive scheme: 'bearer'
    const { context: ctx3, request: req3, reflector: ref3 } = createMockExecutionContext({
      authorization: `bearer ${token}`,
    });
    const res3 = await new JwtAuthGuard(ref3, authService).canActivate(ctx3);
    assert.equal(res3, true);
    assert.equal(req3.user.email, 'whitespace@example.com');

    // Case-insensitive scheme with leading/trailing spaces
    const { context: ctx4, request: req4, reflector: ref4 } = createMockExecutionContext({
      authorization: `   BEARER   ${token}   `,
    });
    const res4 = await new JwtAuthGuard(ref4, authService).canActivate(ctx4);
    assert.equal(res4, true);
    assert.equal(req4.user.email, 'whitespace@example.com');
  });

  await t.test('9. Public route bypasses authentication', async () => {
    const authService = new AuthService(createConfigService());
    const { context, request, reflector } = createMockExecutionContext({}, true);
    const guard = new JwtAuthGuard(reflector, authService);

    const result = await guard.canActivate(context);
    assert.equal(result, true);
    assert.equal(request.user, undefined);
  });

  await t.test('10. Missing SUPABASE_URL throws safe 500 error', async () => {
    const unconfiguredService = new AuthService({ get: () => undefined });
    await assert.rejects(
      async () => await unconfiguredService.verifyToken('any.token'),
      (err) =>
        err instanceof InternalServerErrorException &&
        err.message === 'Authentication service is misconfigured.',
    );
  });

  await t.test('11. JWKS network/fetch failure throws 503 Service Unavailable', async () => {
    const authService = new AuthService(createConfigService());
    const failingResolver = () => {
      const err = new Error('fetch failed');
      err.code = 'ERR_JWKS_FETCH_FAILED';
      throw err;
    };
    authService.setJwksResolver(failingResolver, expectedIssuer);

    const token = await createToken({});
    await assert.rejects(
      async () => await authService.verifyToken(token),
      (err) =>
        err instanceof ServiceUnavailableException &&
        err.message === 'Authentication service is temporarily unavailable.',
    );
  });

  await t.test('12. Safely handles missing email and missing metadata', async () => {
    const authService = new AuthService(createConfigService());
    authService.setJwksResolver(localJwkSet, expectedIssuer);

    const token = await createToken({});
    const user = await authService.verifyToken(token);

    assert.equal(user.id, validUuid);
    assert.equal(user.email, undefined);
    assert.equal(user.role, undefined);
    assert.deepEqual(user.appMetadata, {});
    assert.deepEqual(user.userMetadata, {});
    assert.equal(Object.isFrozen(user.appMetadata), true);
    assert.equal(Object.isFrozen(user.userMetadata), true);
  });
});
