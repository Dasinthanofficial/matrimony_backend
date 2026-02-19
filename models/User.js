// ===== FILE: ./models/User.js =====
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

const agencyVerificationSchema = new Schema(
  {
    status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none', index: true },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,

    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female'] },
    currentAddress: String,

    nicFrontUrl: String,
    nicBackUrl: String,
    businessRegCertUrl: String,
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    countryCode: { type: String, default: '+94' },

    password: { type: String, required: true, minlength: 6 },

    fullName: { type: String, trim: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile' },

    role: { type: String, enum: ['user', 'agency', 'admin', 'moderator', 'superadmin'], default: 'user', index: true },

    preferredLanguage: {
      type: String,
      enum: ['en', 'si', 'ta'],
      default: 'en',
      index: true,
    },

    isManagedProfile: { type: Boolean, default: false, index: true },
    managedByAgencyId: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    agencyVerification: { type: agencyVerificationSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false },
    suspensionReason: String,
    suspensionDate: Date,

    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    isPremium: { type: Boolean, default: false },
    premiumExpiry: Date,

    subscription: {
      plan: { type: String, default: 'free' },
      startDate: Date,
      endDate: Date,
      isActive: { type: Boolean, default: false },
    },

    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null, index: true },

    contactsUnlocked: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],

    refreshToken: String,
    emailVerificationToken: String,
    emailVerificationExpiry: Date,
    passwordResetToken: String,
    passwordResetExpiry: Date,

    lastLogin: Date,
    lastActive: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default model('User', userSchema);