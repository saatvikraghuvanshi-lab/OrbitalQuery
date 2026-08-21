/**
 * Request ID middleware.
 *
 * Assigns a unique ID to every request for cross-service correlation.
 * If the client sends X-Request-ID, it is reused; otherwise a new UUID is generated.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  next();
}
