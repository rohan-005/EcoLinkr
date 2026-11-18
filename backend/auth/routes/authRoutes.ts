import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  getPendingRecyclers,
  verifyRecycler,
  updateUserStatus,
} from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Public auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Authenticated user routes
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getProfile);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/change-password', authenticateToken, changePassword);

// Admin-only routes
router.get('/users', authenticateToken, requireRole('ADMIN'), getAllUsers);
router.get('/recyclers/pending', authenticateToken, requireRole('ADMIN'), getPendingRecyclers);
router.put('/recyclers/:id/verify', authenticateToken, requireRole('ADMIN'), verifyRecycler);
router.put('/users/:id/status', authenticateToken, requireRole('ADMIN'), updateUserStatus);

export default router;
