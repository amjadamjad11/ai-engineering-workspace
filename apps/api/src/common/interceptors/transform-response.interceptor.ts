import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@ai-workspace/shared';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((response) => {
        // If response is already an envelope, return as-is
        if (
          response &&
          typeof response === 'object' &&
          'success' in response &&
          response.success === true &&
          'data' in response
        ) {
          return response;
        }

        // If response includes separate data and meta fields
        if (response && typeof response === 'object' && 'data' in response && 'meta' in response) {
          return {
            success: true,
            data: response.data,
            meta: response.meta,
            error: null,
          };
        }

        // Standard wrapping
        return {
          success: true,
          data: response ?? null,
          meta: null,
          error: null,
        };
      }),
    );
  }
}
