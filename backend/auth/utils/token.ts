import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ecolinkr-jwt-secret-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ecolinkr-jwt-refresh-secret-key-2026';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  isVerified: boolean;
  verificationStatus: string;
}

export function generateAccessToken(user: IUser): string {
  const payload: TokenPayload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
    verificationStatus: user.verificationStatus,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function generateRefreshToken(user: IUser): string {
  const payload = {
    id: user._id.toString(),
  };
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { id: string };
}
