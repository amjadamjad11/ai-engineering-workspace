const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  InternalServerErrorException,
} = require('@nestjs/common');
const { Prisma } = require('@prisma/client');
const { ApiErrorCode } = require('@ai-workspace/shared');
const { HttpExceptionFilter } = require('../dist/common/filters/http-exception.filter');

test('HttpExceptionFilter — Error Contract & Database Connectivity Suite', async (t) => {
  const filter = new HttpExceptionFilter();

  const createMockHost = (url = '/api/v1/test') => {
    let statusCode = null;
    let responseBody = null;

    const mockResponse = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };

    const mockRequest = {
      url,
    };

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };

    return {
      host: mockHost,
      getResult: () => ({ statusCode, responseBody }),
    };
  };

  await t.test('1. Maps ServiceUnavailableException to 503 and SERVICE_UNAVAILABLE', () => {
    const { host, getResult } = createMockHost('/api/v1/health');
    const exception = new ServiceUnavailableException('Service is temporarily unavailable.');

    filter.catch(exception, host);
    const { statusCode, responseBody } = getResult();

    assert.equal(statusCode, 503);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.data, null);
    assert.equal(responseBody.meta, null);
    assert.equal(responseBody.error.code, ApiErrorCode.SERVICE_UNAVAILABLE);
    assert.equal(responseBody.error.message, 'Service is temporarily unavailable.');
    assert.equal(responseBody.error.path, '/api/v1/health');
    assert.ok(responseBody.error.timestamp);
  });

  await t.test('2. Maps PrismaClientKnownRequestError connectivity codes (P1001, P1002, P1017) to 503', () => {
    const codes = ['P1001', 'P1002', 'P1017'];

    for (const code of codes) {
      const { host, getResult } = createMockHost('/api/v1/tasks');
      const knownError = new Prisma.PrismaClientKnownRequestError(
        `Database connection error ${code} with sensitive postgres://user:pwd@host`,
        {
          code,
          clientVersion: '6.19.3',
        },
      );

      filter.catch(knownError, host);
      const { statusCode, responseBody } = getResult();

      assert.equal(statusCode, 503, `Code ${code} should map to 503`);
      assert.equal(
        responseBody.error.code,
        ApiErrorCode.SERVICE_UNAVAILABLE,
        `Code ${code} should map to SERVICE_UNAVAILABLE`,
      );
      assert.equal(
        responseBody.error.message,
        'Database service is temporarily unavailable. Please retry shortly.',
      );
      assert.equal(responseBody.error.message.includes('pwd'), false);
    }
  });

  await t.test('3. Maps Prisma connection pool timeout (P2024) to 503 via PrismaClientKnownRequestError', () => {
    const { host, getResult } = createMockHost('/api/v1/projects');
    const p2024Error = new Prisma.PrismaClientKnownRequestError(
      'Timed out fetching a new connection from the pool with secret postgresql://user:pwd@db.host',
      {
        code: 'P2024',
        clientVersion: '6.19.3',
      },
    );

    filter.catch(p2024Error, host);
    const { statusCode, responseBody } = getResult();

    assert.equal(statusCode, 503);
    assert.equal(responseBody.error.code, ApiErrorCode.SERVICE_UNAVAILABLE);
    assert.equal(
      responseBody.error.message,
      'Database service is temporarily unavailable. Please retry shortly.',
    );
    assert.equal(responseBody.error.message.includes('pwd'), false);
  });

  await t.test('4. Maps PrismaClientInitializationError with verified connectivity code (P1001) to 503', () => {
    const { host, getResult } = createMockHost('/api/v1/projects');
    const initErrorWithP1001 = new Prisma.PrismaClientInitializationError(
      'Can not reach database server at postgresql://postgres:supersecretpassword@db.supabase.co:5432/postgres',
      '6.19.3',
      'P1001',
    );

    filter.catch(initErrorWithP1001, host);
    const { statusCode, responseBody } = getResult();

    assert.equal(statusCode, 503);
    assert.equal(responseBody.success, false);
    assert.equal(responseBody.error.code, ApiErrorCode.SERVICE_UNAVAILABLE);
    assert.equal(
      responseBody.error.message,
      'Database service is temporarily unavailable. Please retry shortly.',
    );
    assert.equal(responseBody.error.message.includes('supersecretpassword'), false);
    assert.equal(responseBody.error.message.includes('postgresql://'), false);
  });

  await t.test('5. Maps PrismaClientInitializationError without qualifying code (or missing code) to 500', () => {
    const { host, getResult } = createMockHost('/api/v1/projects');
    const initErrorWithoutCode = new Prisma.PrismaClientInitializationError(
      'Missing binary engine or malformed schema with internal postgresql://postgres:pw@host',
      '6.19.3',
    );

    filter.catch(initErrorWithoutCode, host);
    const { statusCode, responseBody } = getResult();

    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
    assert.equal(responseBody.error.message.includes('postgres'), false);
  });

  await t.test('6. Does NOT map P1000 (invalid credentials) to 503 — falls through to 500', () => {
    const { host, getResult } = createMockHost('/api/v1/auth');
    const p1000Error = new Prisma.PrismaClientKnownRequestError(
      'Authentication failed for user "postgres" with password "supersecret"',
      {
        code: 'P1000',
        clientVersion: '6.19.3',
      },
    );

    filter.catch(p1000Error, host);
    const { statusCode, responseBody } = getResult();

    assert.notEqual(statusCode, 503);
    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
  });

  await t.test('7. Does NOT map P1008 (operation/query timeout) to 503 — falls through to 500', () => {
    const { host, getResult } = createMockHost('/api/v1/tasks');
    const p1008Error = new Prisma.PrismaClientKnownRequestError(
      'Operations timed out after 5000ms on SELECT * FROM sensitive_table',
      {
        code: 'P1008',
        clientVersion: '6.19.3',
      },
    );

    filter.catch(p1008Error, host);
    const { statusCode, responseBody } = getResult();

    assert.notEqual(statusCode, 503);
    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
  });

  await t.test('8. Does NOT map PrismaClientRustPanicError to 503 — falls through to sanitized 500', () => {
    const { host, getResult } = createMockHost('/api/v1/tasks');
    const panicError = new Prisma.PrismaClientRustPanicError(
      'Engine crashed in query-engine/core/src/executor.rs:42 with query AST containing SELECT secret',
      '6.19.3',
    );

    filter.catch(panicError, host);
    const { statusCode, responseBody } = getResult();

    assert.notEqual(statusCode, 503);
    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
  });

  await t.test('9. Does NOT map unknown Prisma code (e.g. P9999) to 503 — falls through to 500', () => {
    const { host, getResult } = createMockHost('/api/v1/tasks');
    const unknownPrismaError = new Prisma.PrismaClientKnownRequestError(
      'Unknown error occurred in database engine',
      {
        code: 'P9999',
        clientVersion: '6.19.3',
      },
    );

    filter.catch(unknownPrismaError, host);
    const { statusCode, responseBody } = getResult();

    assert.notEqual(statusCode, 503);
    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
  });

  await t.test('10. Does NOT trust plain objects forged with code: "P1001" — falls through to 500', () => {
    const { host, getResult } = createMockHost('/api/v1/tasks');
    const forgedObject = {
      code: 'P1001',
      message: 'I am a fake Prisma error',
    };

    filter.catch(forgedObject, host);
    const { statusCode, responseBody } = getResult();

    assert.notEqual(statusCode, 503);
    assert.equal(statusCode, 500);
    assert.equal(responseBody.error.code, ApiErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(responseBody.error.message, 'An unexpected internal server error occurred.');
  });

  await t.test('11. Logger security: does NOT log credentials or stack traces on connectivity (503) branch', () => {
    const loggedMessages = [];
    const originalError = filter.logger.error;
    filter.logger.error = function (msg, stack) {
      loggedMessages.push({ msg, stack });
    };

    try {
      const { host } = createMockHost('/api/v1/projects');
      const sensitiveError = new Prisma.PrismaClientKnownRequestError(
        'Database connection failed at postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres',
        {
          code: 'P1001',
          clientVersion: '6.19.3',
        },
      );
      sensitiveError.stack = 'Error at postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres\n    at test.js:10';

      filter.catch(sensitiveError, host);

      assert.equal(loggedMessages.length, 1);
      const { msg, stack } = loggedMessages[0];
      assert.equal(msg.includes('SuperSecretPassword123'), false, 'Password must not appear in log message');
      assert.equal(msg.includes('postgresql://'), false, 'URL must not appear in log message');
      assert.equal(msg.includes('P1001'), true, 'Safe code P1001 should appear in log message');
      assert.equal(stack, undefined, 'Stack trace must not be passed to logger on connectivity branch');
    } finally {
      filter.logger.error = originalError;
    }
  });

  await t.test('12. Logger security: does NOT log credentials, raw messages, or stack traces on P1000 (500)', () => {
    const loggedMessages = [];
    const originalError = filter.logger.error;
    filter.logger.error = function (msg, stack) {
      loggedMessages.push({ msg, stack });
    };

    try {
      const { host } = createMockHost('/api/v1/auth');
      const p1000Error = new Prisma.PrismaClientKnownRequestError(
        'Authentication failed for user postgres with password postgresql://postgres:SuperSecretPassword999@db.supabase.co:5432/postgres',
        {
          code: 'P1000',
          clientVersion: '6.19.3',
        },
      );
      p1000Error.stack = 'Error: Authentication failed with SuperSecretPassword999\n    at test.js:20';

      filter.catch(p1000Error, host);

      assert.equal(loggedMessages.length, 1);
      const { msg, stack } = loggedMessages[0];
      assert.equal(msg.includes('SuperSecretPassword999'), false, 'Password must not appear in log message');
      assert.equal(msg.includes('postgresql://'), false, 'URL must not appear in log message');
      assert.equal(msg.includes('P1000'), true, 'Safe code P1000 should appear in log message');
      assert.equal(stack, undefined, 'Stack trace must not be passed to logger on Prisma 500 branch');
    } finally {
      filter.logger.error = originalError;
    }
  });

  await t.test('13. Logger security: does NOT log raw message, query parameters, or stack traces on P1008 (500)', () => {
    const loggedMessages = [];
    const originalError = filter.logger.error;
    filter.logger.error = function (msg, stack) {
      loggedMessages.push({ msg, stack });
    };

    try {
      const { host } = createMockHost('/api/v1/tasks');
      const p1008Error = new Prisma.PrismaClientKnownRequestError(
        'Operations timed out after 5000ms: SELECT * FROM users WHERE ssn = "123-45-6789"',
        {
          code: 'P1008',
          clientVersion: '6.19.3',
        },
      );
      p1008Error.stack = 'Error on query: SELECT * FROM users WHERE ssn = "123-45-6789"\n    at test.js:30';

      filter.catch(p1008Error, host);

      assert.equal(loggedMessages.length, 1);
      const { msg, stack } = loggedMessages[0];
      assert.equal(msg.includes('123-45-6789'), false, 'Query parameters/secrets must not appear in log message');
      assert.equal(msg.includes('SELECT'), false, 'Raw SQL must not appear in log message');
      assert.equal(msg.includes('P1008'), true, 'Safe code P1008 should appear in log message');
      assert.equal(stack, undefined, 'Stack trace must not be passed to logger on Prisma 500 branch');
    } finally {
      filter.logger.error = originalError;
    }
  });

  await t.test('14. Logger security: does NOT log raw message or stack on InitializationError without code (500)', () => {
    const loggedMessages = [];
    const originalError = filter.logger.error;
    filter.logger.error = function (msg, stack) {
      loggedMessages.push({ msg, stack });
    };

    try {
      const { host } = createMockHost('/api/v1/init');
      const initError = new Prisma.PrismaClientInitializationError(
        'Failed to initialize engine with connection string postgresql://postgres:SecretPass456@db.supabase.co:5432/postgres',
        '6.19.3',
      );
      initError.stack = 'Error at postgresql://postgres:SecretPass456@db.supabase.co:5432/postgres\n    at test.js:40';

      filter.catch(initError, host);

      assert.equal(loggedMessages.length, 1);
      const { msg, stack } = loggedMessages[0];
      assert.equal(msg.includes('SecretPass456'), false, 'Password must not appear in log message');
      assert.equal(msg.includes('postgresql://'), false, 'URL must not appear in log message');
      assert.equal(msg.includes('initialization error'), true, 'Safe category should appear');
      assert.equal(stack, undefined, 'Stack trace must not be passed to logger on Prisma 500 branch');
    } finally {
      filter.logger.error = originalError;
    }
  });

  await t.test('15. Logger security: does NOT log raw engine message or stack on Rust panic (500)', () => {
    const loggedMessages = [];
    const originalError = filter.logger.error;
    filter.logger.error = function (msg, stack) {
      loggedMessages.push({ msg, stack });
    };

    try {
      const { host } = createMockHost('/api/v1/tasks');
      const panicError = new Prisma.PrismaClientRustPanicError(
        'Engine crashed in executor.rs with query AST containing SELECT SecretToken789',
        '6.19.3',
      );
      panicError.stack = 'Panic backtrace containing SecretToken789\n    at query_core.rs:50';

      filter.catch(panicError, host);

      assert.equal(loggedMessages.length, 1);
      const { msg, stack } = loggedMessages[0];
      assert.equal(msg.includes('SecretToken789'), false, 'Internal panic secrets must not appear in log message');
      assert.equal(msg.includes('engine panic'), true, 'Safe category should appear');
      assert.equal(stack, undefined, 'Stack trace must not be passed to logger on Prisma 500 branch');
    } finally {
      filter.logger.error = originalError;
    }
  });

  await t.test('16. Preserves existing standard HTTP exception mappings', () => {
    const expectations = [
      {
        exception: new BadRequestException('Validation failed'),
        expectedStatus: 400,
        expectedCode: ApiErrorCode.VALIDATION_ERROR,
      },
      {
        exception: new UnauthorizedException('Token expired'),
        expectedStatus: 401,
        expectedCode: ApiErrorCode.UNAUTHORIZED,
      },
      {
        exception: new ForbiddenException('Access denied'),
        expectedStatus: 403,
        expectedCode: ApiErrorCode.FORBIDDEN,
      },
      {
        exception: new NotFoundException('Project not found'),
        expectedStatus: 404,
        expectedCode: ApiErrorCode.RESOURCE_NOT_FOUND,
      },
      {
        exception: new ConflictException('Slug already taken'),
        expectedStatus: 409,
        expectedCode: ApiErrorCode.CONFLICT,
      },
      {
        exception: new InternalServerErrorException('Crash'),
        expectedStatus: 500,
        expectedCode: 'Internal Server Error',
      },
    ];

    for (const { exception, expectedStatus, expectedCode } of expectations) {
      const { host, getResult } = createMockHost();
      filter.catch(exception, host);
      const { statusCode, responseBody } = getResult();

      assert.equal(statusCode, expectedStatus);
      assert.equal(responseBody.error.code, expectedCode);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.data, null);
    }
  });

  await t.test('17. Preserves ValidationPipe array detail mapping', () => {
    const { host, getResult } = createMockHost();
    const validationException = new BadRequestException({
      message: ['name should not be empty', 'slug must be a valid slug'],
      error: 'Bad Request',
      statusCode: 400,
    });

    filter.catch(validationException, host);
    const { statusCode, responseBody } = getResult();

    assert.equal(statusCode, 400);
    assert.equal(responseBody.error.code, ApiErrorCode.VALIDATION_ERROR);
    assert.equal(responseBody.error.message, 'Validation failed for the request payload.');
    assert.equal(responseBody.error.details.length, 2);
    assert.equal(responseBody.error.details[0].message, 'name should not be empty');
    assert.equal(responseBody.error.details[1].message, 'slug must be a valid slug');
  });
});
