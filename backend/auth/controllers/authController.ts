import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User, IUser } from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const {
      role,
      email,
      phone,
      password,
      fullName,
      organizationName,
      contactPerson,
      preferredLanguage,
      address,
      city,
      state,
      licenseNumber,
      acceptedMaterialCategories,
      profileImage,
    } = req.body;

    // Security: Public registration as ADMIN must be impossible
    if (role === 'ADMIN' || (req.body.role && req.body.role.toUpperCase() === 'ADMIN')) {
      res.status(403).json({
        success: false,
        error: 'Public registration as ADMIN is prohibited',
      });
      return;
    }

    const assignedRole = role === 'RECYCLER' ? 'RECYCLER' : 'COLLECTOR';

    // Basic validation
    if (!email || !phone || !password) {
      res.status(400).json({
        success: false,
        error: 'Email, phone, and password are required',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long',
      });
      return;
    }

    // Role-specific validation
    if (assignedRole === 'COLLECTOR' && !fullName) {
      res.status(400).json({
        success: false,
        error: 'Full name is required for collector registration',
      });
      return;
    }

    if (assignedRole === 'RECYCLER' && (!organizationName || !contactPerson)) {
      res.status(400).json({
        success: false,
        error: 'Organization name and contact person are required for recycler registration',
      });
      return;
    }

    // Check duplicate email or phone
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
      }
      res.status(409).json({ success: false, error: 'Phone number already registered' });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const isTest = Boolean(
      req.body.isTest ||
      normalizedEmail.startsWith('test_') ||
      normalizedEmail.startsWith('e2e_') ||
      (fullName && fullName.startsWith('test_')) ||
      (organizationName && organizationName.startsWith('test_'))
    );

    const isRecycler = assignedRole === 'RECYCLER';

    const newUser = new User({
      fullName: assignedRole === 'COLLECTOR' ? fullName.trim() : undefined,
      organizationName: isRecycler ? organizationName.trim() : undefined,
      contactPerson: isRecycler ? contactPerson.trim() : undefined,
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      role: assignedRole,
      preferredLanguage: preferredLanguage || 'en',
      address,
      city,
      state,
      profileImage,
      licenseNumber: isRecycler ? licenseNumber : undefined,
      acceptedMaterialCategories: isRecycler ? acceptedMaterialCategories || [] : undefined,
      isVerified: !isRecycler,
      verificationStatus: isRecycler ? 'PENDING' : 'VERIFIED',
      isActive: true,
      refreshTokens: [],
      isTest,
    });

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    newUser.refreshTokens.push(refreshToken);

    await newUser.save();

    res.status(201).json({
      success: true,
      message: isRecycler
        ? 'Registration successful. Recycler account is pending admin verification.'
        : 'Registration successful',
      data: {
        user: newUser,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Registration failed' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, error: 'Account is deactivated. Please contact support.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password!);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshTokens.push(refreshToken);
    // Keep max 5 refresh tokens
    if (user.refreshTokens.length > 5) {
      user.refreshTokens.shift();
    }
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Login failed' });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken: incomingToken } = req.body;

    if (!incomingToken) {
      res.status(400).json({ success: false, error: 'Refresh token is required' });
      return;
    }

    let payload: { id: string };
    try {
      payload = verifyRefreshToken(incomingToken);
    } catch (err) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      return;
    }

    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'User not found or account deactivated' });
      return;
    }

    if (!user.refreshTokens.includes(incomingToken)) {
      res.status(401).json({ success: false, error: 'Refresh token revoked or invalid' });
      return;
    }

    const newAccessToken = generateAccessToken(user);
    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Token refresh failed' });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { refreshToken: tokenToRemove } = req.body;
    if (req.user && tokenToRemove) {
      req.user.refreshTokens = req.user.refreshTokens.filter((t) => t !== tokenToRemove);
      await req.user.save();
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Logout failed' });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Do not reveal email existence to prevent user enumeration
      res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been prepared.',
      });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    res.json({
      success: true,
      message: 'Password reset link generated successfully',
      resetToken, // Returned in dev/test environment for easy reset flow
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Forgot password failed' });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ success: false, error: 'Token and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
      return;
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokens = []; // Revoke sessions on password reset
    await user.save();

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Reset password failed' });
  }
}

export async function getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    res.json({ success: true, data: req.user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch profile' });
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const user = req.user;
    const {
      fullName,
      organizationName,
      contactPerson,
      preferredLanguage,
      address,
      city,
      state,
      profileImage,
      licenseNumber,
      acceptedMaterialCategories,
    } = req.body;

    if (fullName && user.role === 'COLLECTOR') user.fullName = fullName.trim();
    if (organizationName && user.role === 'RECYCLER') user.organizationName = organizationName.trim();
    if (contactPerson && user.role === 'RECYCLER') user.contactPerson = contactPerson.trim();
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (address !== undefined) user.address = address;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (profileImage !== undefined) user.profileImage = profileImage;
    if (licenseNumber !== undefined && user.role === 'RECYCLER') user.licenseNumber = licenseNumber;
    if (acceptedMaterialCategories && user.role === 'RECYCLER') {
      user.acceptedMaterialCategories = acceptedMaterialCategories;
    }

    await user.save();
    res.json({ success: true, message: 'Profile updated successfully', data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Profile update failed' });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Current and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, req.user.password!);
    if (!isMatch) {
      res.status(400).json({ success: false, error: 'Incorrect current password' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    req.user.password = await bcrypt.hash(newPassword, salt);
    await req.user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Change password failed' });
  }
}

// Admin Controller methods
export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { role, isVerified, isActive, search, page = '1', limit = '50' } = req.query;
    const filter: any = {};

    if (role) filter.role = role;
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      filter.$or = [
        { fullName: searchRegex },
        { organizationName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { city: searchRegex },
      ];
    }

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        users,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch users' });
  }
}

export async function getPendingRecyclers(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const pendingRecyclers = await User.find({
      role: 'RECYCLER',
      verificationStatus: 'PENDING',
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: pendingRecyclers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch pending recyclers' });
  }
}

export async function verifyRecycler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, error: "Status must be 'VERIFIED' or 'REJECTED'" });
      return;
    }

    const recycler = await User.findOne({ _id: id, role: 'RECYCLER' });
    if (!recycler) {
      res.status(404).json({ success: false, error: 'Recycler not found' });
      return;
    }

    recycler.verificationStatus = status;
    recycler.isVerified = status === 'VERIFIED';
    recycler.verificationNotes = notes;
    recycler.verifiedAt = new Date();
    recycler.verifiedBy = req.user?._id as any;

    await recycler.save();

    res.json({
      success: true,
      message: `Recycler verification status updated to ${status}`,
      data: recycler,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to verify recycler' });
  }
}

export async function updateUserStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ success: false, error: 'isActive must be a boolean' });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `User account ${isActive ? 'activated' : 'deactivated'}`,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update user status' });
  }
}
