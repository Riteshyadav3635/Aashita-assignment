import { type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../lib/errors.js';
import { can, type Action } from '../modules/rbac/permissions.js';

export function requirePermission(action: Action) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.membership?.role;
    if (!role || !can(role, action)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}
