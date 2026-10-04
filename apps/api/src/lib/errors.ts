import type { Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  const requestId = 'id' in req && typeof req.id === 'string' ? req.id : 'unknown';
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
      requestId,
    },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response) {
  const requestId = 'id' in req && typeof req.id === 'string' ? req.id : 'unknown';

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
        requestId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const status = err.status >= 400 ? err.status : 500;
    res.status(status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
    return;
  }

  if (typeof err === 'object' && err !== null && 'status' in err && 'code' in err) {
    const errorLike = err as { status?: number; code?: string; message?: string; details?: unknown };
    res.status(errorLike.status ?? 500).json({
      error: {
        code: errorLike.code ?? 'INTERNAL_ERROR',
        message: errorLike.message ?? 'Something went wrong',
        details: errorLike.details,
        requestId,
      },
    });
    return;
  }

  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err instanceof Error ? err.message : 'Unknown error';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message,
      requestId,
    },
  });
}
