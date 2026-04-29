import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // Already formatted error (from services throwing formatted errors)
      if (exceptionResponse?.success === false) {
        return response.status(status).json(exceptionResponse);
      }

      // NestJS validation pipe errors
      if (exceptionResponse?.message && Array.isArray(exceptionResponse.message)) {
        return response.status(status).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: exceptionResponse.message[0],
          },
        });
      }

      // Generic HTTP exception
      return response.status(status).json({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: exceptionResponse?.message || exception.message,
        },
      });
    }

    // Unhandled errors
    this.logger.error(`Unhandled exception on ${request.method} ${request.url}`, exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}
