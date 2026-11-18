import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'COLLECTOR' | 'RECYCLER' | 'ADMIN';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface IUser extends Document {
  fullName?: string;
  organizationName?: string;
  contactPerson?: string;
  email: string;
  phone: string;
  password?: string;
  role: UserRole;
  preferredLanguage: string;
  address?: string;
  city?: string;
  state?: string;
  profileImage?: string;
  licenseNumber?: string;
  acceptedMaterialCategories?: string[];
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  refreshTokens: string[];
  isTest: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, trim: true },
    organizationName: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['COLLECTOR', 'RECYCLER', 'ADMIN'],
      default: 'COLLECTOR',
      required: true,
      index: true,
    },
    preferredLanguage: {
      type: String,
      default: 'en',
    },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    profileImage: { type: String },
    licenseNumber: { type: String, trim: true },
    acceptedMaterialCategories: [{ type: String }],
    isVerified: {
      type: Boolean,
      default: function (this: IUser) {
        return this.role !== 'RECYCLER';
      },
    },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: function (this: IUser) {
        return this.role === 'RECYCLER' ? 'PENDING' : 'VERIFIED';
      },
      index: true,
    },
    verificationNotes: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true, index: true },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    refreshTokens: [{ type: String }],
    isTest: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.refreshTokens;
        return ret;
      },
    },
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
