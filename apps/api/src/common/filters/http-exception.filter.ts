import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiErrorResponse, ApiErrorCode } from '@ai-workspace/shared';

// Specific Prisma error codes representing temporary database connectivity or pool availability failures.
// - P1001: Can't reach database server (server unreachable, network down, DNS failure)
// - P1002: Database server reached but connection timed out during handshake
// - P1017: Server has closed the connection (socket closed, backend restart, failover)
// - P2024: Timed out trying to acquire a connection from the pool (connection pool starvation/exhaustion)
//
// Explicitly excluded from 503:
// - P1000: Invalid database credentials (permanent configuration error -> 500)
// - P1008: Operations timed out (statement/query execution timeout -> 500)
// - PrismaClientRustPanicError: Native query engine crash -> 500
const PRISMA_CONNECTIVITY_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1017',
  'P2024',
]);

// PrismaClientInitializationError error codes representing connectivity failures at startup/init
const PRISMA_INIT_CONNECTIVITY_ERROR_CODES = new Set([
  'P1001',
  'P1002',
  'P1017',
]);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string = ApiErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal server error occurred.';
    let details: any[] | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, any>;

        // Handle class-validator ValidationPipe structured error array
        if (Array.isArray(resObj.message)) {
          errorCode = ApiErrorCode.VALIDATION_ERROR;
          message = 'Validation failed for the request payload.';
          details = resObj.message.map((msg: string) => ({
            message: msg,
          }));
        } else {
          message = resObj.message || exception.message;
        }

        if (resObj.error && typeof resObj.error === 'string') {
          errorCode = this.mapStatusToErrorCode(status, resObj.error);
        }
      }

      // If errorCode was not overridden from response object, map by status code
      if (errorCode === ApiErrorCode.INTERNAL_SERVER_ERROR && status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        errorCode = this.mapStatusToErrorCode(status);
      }
    } else if (this.isPrismaException(exception)) {
      const connectivityCode = this.getPrismaConnectivityCode(exception);
      if (connectivityCode) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        errorCode = ApiErrorCode.SERVICE_UNAVAILABLE;
        message = 'Database service is temporarily unavailable. Please retry shortly.';
        // Log safe metadata only — never log raw exception.message, connection URLs, passwords, or stack traces
        this.logger.error(
          `Database connectivity failure: temporary availability outage (code: ${connectivityCode}).`,
        );
      } else {
        // Excluded or general Prisma error: status remains 500, message remains generic internal error
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        errorCode = ApiErrorCode.INTERNAL_SERVER_ERROR;
        message = 'An unexpected internal server error occurred.';
        const safeCode = this.extractPrismaErrorCode(exception);
        const errorCategory = this.classifyPrismaErrorCategory(exception);
        // Log safe metadata only — never log raw exception.message, query parameters, connection URLs, or stack traces
        this.logger.error(
          `Database operation failure: ${errorCategory} (code: ${safeCode || 'UNKNOWN'}).`,
        );
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unknown exception thrown: ${JSON.stringify(exception)}`);
    }

    const errorPayload: ApiErrorResponse = {
      success: false,
      data: null,
      meta: null,
      error: {
        code: errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    response.status(status).json(errorPayload);
  }

  private isPrismaException(exception: unknown): boolean {
    return (
      exception instanceof Prisma.PrismaClientKnownRequestError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientValidationError
    );
  }

  private extractPrismaErrorCode(exception: unknown): string | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return exception.code;
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return exception.errorCode || null;
    }
    return null;
  }

  private classifyPrismaErrorCategory(exception: unknown): string {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return 'known request error';
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return 'initialization error';
    }
    if (exception instanceof Prisma.PrismaClientRustPanicError) {
      return 'engine panic';
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return 'client validation error';
    }
    if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      return 'unknown request error';
    }
    return 'database error';
  }

  private getPrismaConnectivityCode(exception: unknown): string | null {
    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      PRISMA_CONNECTIVITY_ERROR_CODES.has(exception.code)
    ) {
      return exception.code;
    }
    if (
      exception instanceof Prisma.PrismaClientInitializationError &&
      exception.errorCode &&
      PRISMA_INIT_CONNECTIVITY_ERROR_CODES.has(exception.errorCode)
    ) {
      return exception.errorCode;
    }
    return null;
  }

  private mapStatusToErrorCode(status: number, defaultErrorText?: string): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.RATE_LIMIT_EXCEEDED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ApiErrorCode.SERVICE_UNAVAILABLE;
      default:
        return defaultErrorText || ApiErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
