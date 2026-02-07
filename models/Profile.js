// ===== FIXED FILE: server/models/Profile.js =====
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
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    profileId: { type: String, unique: true, sparse: true },

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
    bodyType: { type: String, enum: ['slim', 'average', 'athletic', 'heavy', 'fit', ''] },
    complexion: { type: String, enum: ['very_fair', 'fair', 'wheatish', 'dark', 'dusky', ''] },
    physicalStatus: { type: String, enum: ['normal', 'physically_challenged', 'disabled', ''] },

    diet: { type: String, enum: ['vegetarian', 'non_vegetarian', 'eggetarian', 'vegan', 'jain', 'pescatarian', ''] },
    smoking: { type: String, enum: ['no', 'occasionally', 'yes', 'never', ''] },
    drinking: { type: String, enum: ['no', 'occasionally', 'yes', 'never', 'social', ''] },
    hobbies: [{ type: String }],
    interests: [{ type: String }],
    languages: [{ type: String }],

    country: { type: String, required: true },
    state: { type: String },
    city: { type: String, required: true },
    citizenship: { type: String },
    residencyStatus: {
      type: String,
      enum: ['citizen', 'permanent_resident', 'work_permit', 'student_visa', 'temporary_visa', 'work_visa', 'pr', ''],
    },

    education: {
      type: String,
      enum: [
        'high_school', 'diploma', 'bachelors', 'masters', 'doctorate', 'phd',
        'undergraduate', 'graduate', 'post_graduate', 'professional', 'trade_school',
        'associate', 'mba', 'medical', 'engineering', 'law', 'ca', 'other', '',
      ],
    },
    educationField: { type: String },
    institution: { type: String },
    occupation: { type: String },
    employmentType: {
      type: String,
      enum: [
        'employed', 'self_employed', 'business', 'not_working', 'student',
        'government', 'private', 'public_sector', 'private_sector', 'defence',
        'civil_services', 'freelancer', 'consultant', 'entrepreneur', 'professional',
        'retired', 'homemaker', 'unemployed', '',
      ],
    },
    company: { type: String },
    jobTitle: { type: String },
    annualIncome: {
      type: String,
      enum: [
        'below_2l', '2l_5l', '5l_10l', '10l_15l', '15l_25l', '25l_50l', '50l_1cr', 'above_1cr',
        'below_25k', '25k_50k', '50k_75k', '75k_100k', '100k_150k', '150k_200k', 'above_200k',
        'not_disclosed', 'prefer_not_to_say', '',
      ],
    },

    fatherName: { type: String },
    fatherOccupation: { type: String },
    motherName: { type: String },
    motherOccupation: { type: String },
    siblings: { type: Number },
    familyType: { type: String, enum: ['joint', 'nuclear', 'other', ''] },
    familyStatus: { type: String, enum: ['middle_class', 'upper_middle_class', 'rich', 'affluent', 'lower_middle_class', ''] },
    familyValues: { type: String, enum: ['traditional', 'moderate', 'liberal', 'orthodox', ''] },

    photos: [photoSchema],

    partnerPreferences: {
      ageRange: { min: { type: Number, default: 18 }, max: { type: Number, default: 60 } },
      heightRange: { min: { type: Number, default: 120 }, max: { type: Number, default: 220 } },
      religion: [{ type: String }],
      caste: [{ type: String }],
      motherTongue: [{ type: String }],
      education: [{ type: String }],
      occupation: [{ type: String }],
      annualIncome: [{ type: String }],
      maritalStatus: [{ type: String }],
      diet: [{ type: String }],
      smoking: [{ type: String }],
      drinking: [{ type: String }],
      country: [{ type: String }],
      state: [{ type: String }],
      city: [{ type: String }],
      aboutPartner: { type: String, maxlength: 1000 },
    },

    privacySettings: {
      showPhone: { type: Boolean, default: false },
      showEmail: { type: Boolean, default: false },
      showIncome: { type: Boolean, default: false },
      photoVisibility: { type: String, enum: ['all', 'matches', 'premium', 'none', 'connected'], default: 'all' },
      profileVisibility: { type: String, enum: ['all', 'matches', 'premium', 'none', 'registered'], default: 'all' },
    },

    profileViews: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    // ✅ FIX: Added completionDetails field to persist breakdown
    completionDetails: { type: Schema.Types.Mixed, default: {} },

    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

profileSchema.index({ userId: 1 });
profileSchema.index({ profileId: 1 });
profileSchema.index({ gender: 1, age: 1 });
profileSchema.index({ religion: 1 });
profileSchema.index({ country: 1, city: 1 });
profileSchema.index({ isActive: 1 });

profileSchema.virtual('displayHeight').get(function () {
  if (!this.height) return null;
  if (typeof this.height === 'object' && this.height.feet) {
    return `${this.height.feet}'${this.height.inches || 0}"`;
  }
  if (typeof this.height === 'number') {
    const totalInches = Math.round(this.height / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  return null;
});

export default model('Profile', profileSchema);