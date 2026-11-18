import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/token.js';
import { User, IUser } from '../models/User.js';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  tokenPayload?: TokenPayload;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication token required' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.id);

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'User not found or account deactivated' });
      return;
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid authentication token' });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

export function requireVerifiedRecycler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (req.user.role === 'RECYCLER' && (!req.user.isVerified || req.user.verificationStatus !== 'VERIFIED')) {
    res.status(403).json({
      success: false,
      error: 'Recycler account pending admin verification',
      code: 'RECYCLER_NOT_VERIFIED',
    });
    return;
  }

  next();
}
