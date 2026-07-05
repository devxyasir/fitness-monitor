import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();

    req.headers['x-request-id'] = requestId;

    return next.handle().pipe(
      tap(() => {
        res.setHeader('X-Request-Id', requestId);
      }),
    );
  }
}
