import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse, ApiErrorCode } from '@ai-workspace/shared';

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
      default:
        return defaultErrorText || ApiErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
