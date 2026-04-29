import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If data is already wrapped (service returned pre-formatted response), pass through
        if (data && data.success !== undefined) {
          return data;
        }
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
