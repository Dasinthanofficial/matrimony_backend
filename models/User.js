// server/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    countryCode: { type: String, default: '+91' },

    password: { type: String, required: true, minlength: 6 },

    fullName: { type: String, trim: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile' },

    role: {
      type: String,
      enum: ['user', 'admin', 'moderator', 'superadmin'],
      default: 'user',
    },

    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false },
    suspensionReason: { type: String },
    suspensionDate: { type: Date },

    isVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    isPremium: { type: Boolean, default: false },
    premiumExpiry: { type: Date },

    subscription: {
      plan: { type: String, enum: ['free', 'monthly', 'yearly'], default: 'free' },
      startDate: Date,
      endDate: Date,
      isActive: { type: Boolean, default: false },
    },

    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },

    refreshToken: { type: String },
    emailVerificationToken: String,
    emailVerificationExpiry: Date,

    passwordResetToken: String,
    passwordResetExpiry: Date,

    contactsUnlocked: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    lastLogin: { type: Date },
    lastActive: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    socketId: { type: String },

    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

export default model('User', userSchema);