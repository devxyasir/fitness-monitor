import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter.
 * Maps all errors to { statusCode, error, message, requestId }.
 * NEVER leaks stack traces or internal DB error messages (16_Security_Guidelines.md §10).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? 'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (Array.isArray(body['message'])
          ? (body['message'] as string[]).join(', ')
          : (body['message'] as string | undefined)) ?? exception.message;
        error = (body['error'] as string | undefined) ?? error;
      }
    } else {
      // Unknown error — log with detail server-side, return generic message to client
      this.logger.error(
        `Unhandled exception [${requestId}]: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    response.status(statusCode).json({ statusCode, error, message, requestId });
  }
}
