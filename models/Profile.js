// ===== FIXED FILE: ./models/Profile.js =====
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const photoSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  isProfile: { type: Boolean, default: false },
  uploadedAt: { type: Date, default: Date.now },
});

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // unique id for profile
    profileId: { type: String, unique: true, sparse: true },

    agencyId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    agencyNameTag: { type: String, default: null },
    isAgencyManaged: { type: Boolean, default: false, index: true },

    successFee: { type: Number, default: 0 },
    successFeeCurrency: { type: String, default: 'LKR' },

    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female'], required: true },
    dateOfBirth: { type: Date, required: true },
    age: { type: Number },
    maritalStatus: {
      type: String,
      enum: ['never_married', 'divorced', 'widowed', 'awaiting_divorce', 'annulled'],
      required: true,
    },
    religion: { type: String, required: true },
    caste: { type: String },
    subCaste: { type: String },
    motherTongue: { type: String },
    bio: { type: String, maxlength: 1000 },

    height: { type: Schema.Types.Mixed },
    weight: { type: Number },

    bodyType: { type: String, default: null },
    complexion: { type: String, default: null },
    physicalStatus: { type: String, default: null },

    diet: { type: String },
    smoking: { type: String },
    drinking: { type: String },
    hobbies: [{ type: String }],
    interests: [{ type: String }],
    languages: [{ type: String }],

    country: { type: String, required: true },
    state: { type: String },
    city: { type: String, required: true },

    education: { type: String },
    educationField: { type: String, default: null },
    institution: { type: String, default: null },

    occupation: { type: String },
    employmentType: { type: String, default: null },
    company: { type: String },
    jobTitle: { type: String },
    monthlyIncome: { type: String },
    annualIncome: { type: String },

    citizenship: { type: String, default: null },
    residencyStatus: { type: String, default: null },

    photos: [photoSchema],

    partnerPreferences: { type: Schema.Types.Mixed, default: {} },
    privacySettings: { type: Schema.Types.Mixed, default: {} },

    profileViews: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    completionDetails: { type: Schema.Types.Mixed, default: {} },

    isActive: { type: Boolean, default: true },

    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },

    // already indexed here → DO NOT duplicate in schema.index()
    isApproved: { type: Boolean, default: true, index: true },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 500 },
    rejectionDate: { type: Date, default: null },

    lastActive: { type: Date, default: null, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ===== VALID INDEXES (no duplicates) =====
profileSchema.index({ userId: 1 });
profileSchema.index({ gender: 1, age: 1 });
profileSchema.index({ country: 1, city: 1 });
profileSchema.index({ citizenship: 1 });
profileSchema.index({ isActive: 1 });
profileSchema.index({ agencyId: 1, isAgencyManaged: 1 });

export default model('Profile', profileSchema);