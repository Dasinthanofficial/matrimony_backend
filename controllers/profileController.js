// ===== UPDATED FILE: ./controllers/profileController.js =====
import mongoose from 'mongoose';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import Interest from '../models/Interest.js';
import { applyProfilePrivacy } from '../utils/privacy.js';
import { LIMITS } from '../utils/constants.js';

// ==================== HELPER FUNCTIONS ====================

// Generate unique profile ID (using native JS - no uuid needed)
const generateProfileId = () => {
  const prefix = 'MAT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// Calculate age from date of birth
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Calculate profile completion percentage
const calculateCompletion = (profile) => {
  const details = {};

  // Basic Info (25% weight)
  const basicFields = ['fullName', 'gender', 'dateOfBirth', 'maritalStatus', 'religion'];
  const basicOptional = ['caste', 'motherTongue', 'bio'];
  const basicFilled = basicFields.filter((f) => profile[f]).length;
  const basicOptionalFilled = basicOptional.filter((f) => profile[f]).length;
  details.basicInfo = Math.round(
    ((basicFilled / basicFields.length) * 80) +
    ((basicOptionalFilled / Math.max(basicOptional.length, 1)) * 20)
  );

  // Physical Attributes (15% weight)
  const hasHeight = profile.height && (
    (typeof profile.height === 'object' && profile.height.cm) ||
    (typeof profile.height === 'number' && profile.height > 0)
  );
  const physicalOptional = ['weight', 'bodyType', 'complexion', 'physicalStatus'];
  const physicalOptionalFilled = physicalOptional.filter((f) => profile[f]).length;
  details.physicalAttributes = Math.round(
    (hasHeight ? 50 : 0) +
    ((physicalOptionalFilled / Math.max(physicalOptional.length, 1)) * 50)
  );

  // Lifestyle (10% weight)
  const lifestyleFields = ['diet', 'smoking', 'drinking'];
  const lifestyleFilled = lifestyleFields.filter((f) => profile[f]).length;
  const hobbiesFilled = profile.hobbies?.length > 0 ? 1 : 0;
  details.lifestyle = Math.round(
    ((lifestyleFilled / Math.max(lifestyleFields.length, 1)) * 70) +
    (hobbiesFilled * 30)
  );

  // Location & Career (20% weight)
  const locationFields = ['country', 'city'];
  const locationOptional = ['state', 'citizenship', 'residencyStatus'];
  const careerFields = ['education', 'occupation'];
  const careerOptional = ['educationField', 'institution', 'company', 'jobTitle', 'annualIncome'];

  const locationFilled = locationFields.filter((f) => profile[f]).length;
  const locationOptionalFilled = locationOptional.filter((f) => profile[f]).length;
  const careerFilled = careerFields.filter((f) => profile[f]).length;
  const careerOptionalFilled = careerOptional.filter((f) => profile[f]).length;

  details.location = Math.round(
    ((locationFilled / locationFields.length) * 40) +
    ((locationOptionalFilled / Math.max(locationOptional.length, 1)) * 10) +
    ((careerFilled / Math.max(careerFields.length, 1)) * 30) +
    ((careerOptionalFilled / Math.max(careerOptional.length, 1)) * 20)
  );

  // Education
  details.education = careerFilled > 0
    ? Math.round((careerFilled / Math.max(careerFields.length, 1)) * 100)
    : 0;

  // Photos (15% weight)
  const photoCount = profile.photos?.length || 0;
  details.photos = Math.min(100, photoCount * 25);

  // Partner Preferences (15% weight)
  const prefs = profile.partnerPreferences || {};
  const prefFields = ['ageRange', 'heightRange', 'religion', 'education', 'maritalStatus'];
  const prefsFilled = prefFields.filter((f) => {
    const val = prefs[f];
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  }).length;
  details.partnerPreferences = Math.round((prefsFilled / Math.max(prefFields.length, 1)) * 100);

  // Calculate overall percentage
  const weights = {
    basicInfo: 0.25,
    physicalAttributes: 0.15,
    lifestyle: 0.10,
    location: 0.20,
    photos: 0.15,
    partnerPreferences: 0.15,
  };

  const percentage = Math.round(
    (details.basicInfo * weights.basicInfo) +
    (details.physicalAttributes * weights.physicalAttributes) +
    (details.lifestyle * weights.lifestyle) +
    (details.location * weights.location) +
    (details.photos * weights.photos) +
    (details.partnerPreferences * weights.partnerPreferences)
  );

  return { percentage, details };
};

// Helper: resolve viewer user doc (for entitlements/privacy)
const getViewerUserDoc = async (req) => {
  const viewerId = req.user?.id || req.user?._id;
  if (!viewerId) return null;
  try {
    return await User.findById(viewerId).lean();
  } catch {
    return null;
  }
};

// Helper: is viewer connected (accepted interest) with profile owner?
const isMatchWith = async (viewerId, otherUserId) => {
  if (!viewerId || !otherUserId) return false;

  const exists = await Interest.exists({
    status: 'accepted',
    $or: [
      { senderId: viewerId, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: viewerId },
    ],
  });

  return !!exists;
};

// ==================== PROFILE CRUD ====================

export const getMyProfile = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOne({ userId })
      .populate('userId', 'email phone countryCode isEmailVerified isPhoneVerified isPremium');

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found', profile: null });
    }

    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};

export const createProfile = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const existingProfile = await Profile.findOne({ userId });
    if (existingProfile) {
      return res.status(400).json({ message: 'Profile already exists. Use PUT to update.' });
    }

    const {
      fullName,
      gender,
      dateOfBirth,
      maritalStatus,
      religion,
      country,
      city,
      caste,
      subCaste,
      motherTongue,
      bio,
      height,
      weight,
      bodyType,
      complexion,
      physicalStatus,
      diet,
      smoking,
      drinking,
      hobbies,
      interests,
      languages,
      state,
      citizenship,
      residencyStatus,
      education,
      educationField,
      institution,
      occupation,
      employmentType,
      company,
      jobTitle,
      annualIncome,
      partnerPreferences,
      privacySettings,
    } = req.body;

    const errors = [];
    if (!fullName?.trim()) errors.push({ field: 'fullName', message: 'Full name is required' });
    if (!gender) errors.push({ field: 'gender', message: 'Gender is required' });
    if (!dateOfBirth) errors.push({ field: 'dateOfBirth', message: 'Date of birth is required' });
    if (!maritalStatus) errors.push({ field: 'maritalStatus', message: 'Marital status is required' });
    if (!religion?.trim()) errors.push({ field: 'religion', message: 'Religion is required' });
    if (!country?.trim()) errors.push({ field: 'country', message: 'Country is required' });
    if (!city?.trim()) errors.push({ field: 'city', message: 'City is required' });

    if (errors.length > 0) return res.status(400).json({ message: 'Validation failed', errors });

    if (!['male', 'female'].includes(gender)) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: [{ field: 'gender', message: 'Gender must be male or female' }],
      });
    }

    const validMaritalStatus = ['never_married', 'divorced', 'widowed', 'awaiting_divorce', 'annulled'];
    if (!validMaritalStatus.includes(maritalStatus)) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: [{ field: 'maritalStatus', message: 'Invalid marital status' }],
      });
    }

    const age = calculateAge(dateOfBirth);
    if (age < 18) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: [{ field: 'dateOfBirth', message: 'You must be at least 18 years old' }],
      });
    }

    const profileId = generateProfileId();

    const profileData = {
      userId,
      profileId,
      fullName: fullName.trim(),
      gender,
      dateOfBirth: new Date(dateOfBirth),
      age,
      maritalStatus,
      religion: religion.trim(),
      country: country.trim(),
      city: city.trim(),
    };

    const optionalStringFields = {
      caste,
      subCaste,
      motherTongue,
      bio,
      state,
      citizenship,
      educationField,
      institution,
      occupation,
      company,
      jobTitle,
    };

    Object.entries(optionalStringFields).forEach(([key, value]) => {
      if (value?.trim()) profileData[key] = value.trim();
    });

    const optionalEnumFields = {
      residencyStatus,
      education,
      employmentType,
      annualIncome,
      bodyType,
      complexion,
      physicalStatus,
      diet,
      smoking,
      drinking,
    };

    Object.entries(optionalEnumFields).forEach(([key, value]) => {
      if (value) profileData[key] = value;
    });

    if (height) profileData.height = height;

    if (weight) profileData.weight = typeof weight === 'number' ? weight : parseInt(weight, 10);

    if (Array.isArray(hobbies) && hobbies.length > 0) profileData.hobbies = hobbies;
    if (Array.isArray(interests) && interests.length > 0) profileData.interests = interests;
    if (Array.isArray(languages) && languages.length > 0) profileData.languages = languages;

    if (partnerPreferences && typeof partnerPreferences === 'object') {
      profileData.partnerPreferences = partnerPreferences;
    }

    if (privacySettings && typeof privacySettings === 'object') {
      profileData.privacySettings = {
        showPhone: Boolean(privacySettings.showPhone),
        showEmail: Boolean(privacySettings.showEmail),
        showIncome: Boolean(privacySettings.showIncome),
        photoVisibility: privacySettings.photoVisibility || 'all',
        profileVisibility: privacySettings.profileVisibility || 'all',
      };
    }

    const { percentage, details } = calculateCompletion(profileData);
    profileData.completionPercentage = percentage;
    profileData.completionDetails = details;

    const profile = await Profile.create(profileData);

    await User.findByIdAndUpdate(userId, { profileId: profile._id, fullName: profile.fullName });

    res.status(201).json({ message: 'Profile created successfully', profile });
  } catch (error) {
    console.error('Create profile error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    if (error.code === 11000) return res.status(400).json({ message: 'Profile already exists' });

    res.status(500).json({ message: 'Server error creating profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found. Create one first.' });

    const allowedUpdates = [
      'fullName', 'gender', 'dateOfBirth', 'maritalStatus', 'religion',
      'caste', 'subCaste', 'motherTongue', 'bio',
      'height', 'weight', 'bodyType', 'complexion', 'physicalStatus',
      'diet', 'smoking', 'drinking', 'hobbies', 'interests', 'languages',
      'country', 'state', 'city', 'citizenship', 'residencyStatus',
      'education', 'educationField', 'institution', 'occupation',
      'employmentType', 'company', 'jobTitle', 'annualIncome',
      'partnerPreferences', 'privacySettings',
    ];

    const updates = {};
    const errors = [];

    for (const field of allowedUpdates) {
      if (req.body[field] === undefined) continue;

      const value = req.body[field];

      switch (field) {
        case 'fullName':
          if (!value?.trim()) errors.push({ field, message: 'Full name cannot be empty' });
          else updates[field] = value.trim();
          break;

        case 'gender':
          if (!['male', 'female'].includes(value)) errors.push({ field, message: 'Gender must be male or female' });
          else updates[field] = value;
          break;

        case 'maritalStatus': {
          const validStatus = ['never_married', 'divorced', 'widowed', 'awaiting_divorce', 'annulled'];
          if (!validStatus.includes(value)) errors.push({ field, message: 'Invalid marital status' });
          else updates[field] = value;
          break;
        }

        case 'dateOfBirth': {
          const age = calculateAge(value);
          if (age < 18) errors.push({ field, message: 'You must be at least 18 years old' });
          else {
            updates[field] = new Date(value);
            updates.age = age;
          }
          break;
        }

        case 'height':
          updates[field] = value;
          break;

        case 'weight':
          updates[field] = typeof value === 'number' ? value : parseInt(value, 10) || null;
          break;

        case 'privacySettings':
          if (typeof value === 'object') {
            updates[field] = {
              showPhone: Boolean(value.showPhone),
              showEmail: Boolean(value.showEmail),
              showIncome: Boolean(value.showIncome),
              photoVisibility: value.photoVisibility || profile.privacySettings?.photoVisibility || 'all',
              profileVisibility: value.profileVisibility || profile.privacySettings?.profileVisibility || 'all',
            };
          }
          break;

        case 'partnerPreferences':
          if (typeof value === 'object') {
            const existingPrefs = profile.partnerPreferences?.toObject?.() || profile.partnerPreferences || {};
            updates[field] = { ...existingPrefs, ...value };
          }
          break;

        case 'hobbies':
        case 'interests':
        case 'languages':
          if (Array.isArray(value)) updates[field] = value;
          break;

        default:
          if (typeof value === 'string') updates[field] = value.trim() || undefined;
          else updates[field] = value;
      }
    }

    if (errors.length > 0) return res.status(400).json({ message: 'Validation failed', errors });

    Object.assign(profile, updates);

    const { percentage, details } = calculateCompletion(profile);
    profile.completionPercentage = percentage;
    profile.completionDetails = details;
    await profile.save();

    if (updates.fullName) await User.findByIdAndUpdate(userId, { fullName: updates.fullName });

    res.json({ message: 'Profile updated successfully', profile, completion: { percentage, details } });
  } catch (error) {
    console.error('Update profile error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    res.status(500).json({ message: 'Server error updating profile' });
  }
};

export const deleteProfile = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOneAndDelete({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    await User.findByIdAndUpdate(userId, { $unset: { profileId: 1, fullName: 1 } });

    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ message: 'Server error deleting profile' });
  }
};

// ==================== PROFILE COMPLETION ====================

export const getCompletion = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const profile = await Profile.findOne({ userId });

    if (!profile) {
      return res.json({
        percentage: 0,
        details: {
          basicInfo: 0,
          physicalAttributes: 0,
          lifestyle: 0,
          location: 0,
          education: 0,
          photos: 0,
          partnerPreferences: 0,
        },
      });
    }

    const { percentage, details } = calculateCompletion(profile);

    if (profile.completionPercentage !== percentage || !profile.completionDetails) {
      profile.completionPercentage = percentage;
      profile.completionDetails = details;
      await profile.save();
    }

    res.json({ percentage, details });
  } catch (error) {
    console.error('Get completion error:', error);
    res.status(500).json({ message: 'Failed to calculate profile completion' });
  }
};

// ==================== PROFILE BY ID (PUBLIC) ====================

export const getProfileById = async (req, res) => {
  try {
    const { profileId } = req.params;

    const or = [{ profileId }];
    if (mongoose.Types.ObjectId.isValid(profileId)) {
      or.push({ _id: profileId });
    }

    const profile = await Profile.findOne({ $or: or })
      .populate('userId', 'email phone countryCode isPremium isEmailVerified isPhoneVerified lastActive')
      .lean();

    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const viewer = await getViewerUserDoc(req);

    const profileOwnerId = profile.userId?._id || profile.userId;
    const match = viewer?._id ? await isMatchWith(viewer._id, profileOwnerId) : false;

    const safeProfile = applyProfilePrivacy({
      viewer,
      profile,
      isMatch: match,
    });

    if (viewer?._id && profileOwnerId && viewer._id.toString() !== profileOwnerId.toString()) {
      await Profile.updateOne({ _id: profile._id }, { $inc: { profileViews: 1 } });
    }

    res.json({ profile: safeProfile });
  } catch (error) {
    console.error('Get profile by ID error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};

// ==================== PHOTOS ====================

export const uploadPhotos = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found. Create profile first.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const newPhotos = req.files.map((file, index) => ({
      url: file.location || `/uploads/${file.filename}`,
      publicId: file.filename || file.key,
      isProfile: profile.photos.length === 0 && index === 0,
      uploadedAt: new Date(),
    }));

    const maxPhotos = LIMITS.MAX_PHOTOS;
    const currentCount = profile.photos.length;
    const allowedCount = Math.min(newPhotos.length, maxPhotos - currentCount);

    if (allowedCount <= 0) {
      return res.status(400).json({ message: `Maximum ${maxPhotos} photos allowed` });
    }

    profile.photos.push(...newPhotos.slice(0, allowedCount));

    const { percentage, details } = calculateCompletion(profile);
    profile.completionPercentage = percentage;
    profile.completionDetails = details;

    await profile.save();

    res.json({ message: `${allowedCount} photo(s) uploaded successfully`, photos: profile.photos });
  } catch (error) {
    console.error('Upload photos error:', error);
    res.status(500).json({ message: 'Server error uploading photos' });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { photoId } = req.params;

    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const photoIndex = profile.photos.findIndex(
      (p) => p._id.toString() === photoId || p.publicId === photoId
    );
    if (photoIndex === -1) return res.status(404).json({ message: 'Photo not found' });

    const wasProfilePhoto = profile.photos[photoIndex].isProfile;

    profile.photos.splice(photoIndex, 1);

    if (wasProfilePhoto && profile.photos.length > 0) {
      profile.photos[0].isProfile = true;
    }

    const { percentage, details } = calculateCompletion(profile);
    profile.completionPercentage = percentage;
    profile.completionDetails = details;

    await profile.save();

    res.json({ message: 'Photo deleted successfully', photos: profile.photos });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ message: 'Server error deleting photo' });
  }
};

export const setProfilePhoto = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { photoId } = req.params;

    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const photoIndex = profile.photos.findIndex(
      (p) => p._id.toString() === photoId || p.publicId === photoId
    );
    if (photoIndex === -1) return res.status(404).json({ message: 'Photo not found' });

    profile.photos.forEach((p) => { p.isProfile = false; });
    profile.photos[photoIndex].isProfile = true;

    await profile.save();

    res.json({ message: 'Profile photo updated', photos: profile.photos });
  } catch (error) {
    console.error('Set profile photo error:', error);
    res.status(500).json({ message: 'Server error setting profile photo' });
  }
};

// ==================== PREFERENCES & SETTINGS ====================

export const updatePartnerPreferences = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const allowedFields = [
      'ageRange', 'heightRange', 'religion', 'caste', 'motherTongue',
      'education', 'occupation', 'annualIncome', 'maritalStatus',
      'diet', 'smoking', 'drinking', 'country', 'state', 'city',
      'aboutPartner',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const existingPrefs = profile.partnerPreferences?.toObject?.() || profile.partnerPreferences || {};
    profile.partnerPreferences = { ...existingPrefs, ...updates };

    const { percentage, details } = calculateCompletion(profile);
    profile.completionPercentage = percentage;
    profile.completionDetails = details;

    await profile.save();

    res.json({
      message: 'Partner preferences updated',
      partnerPreferences: profile.partnerPreferences,
      completion: { percentage, details },
    });
  } catch (error) {
    console.error('Update partner preferences error:', error);
    res.status(500).json({ message: 'Server error updating preferences' });
  }
};

export const updatePrivacySettings = async (req, res) => {
  try {
    const { id: userId } = req.user;

    const profile = await Profile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const { showPhone, showEmail, showIncome, photoVisibility, profileVisibility } = req.body;

    profile.privacySettings = {
      showPhone: showPhone !== undefined ? Boolean(showPhone) : profile.privacySettings?.showPhone,
      showEmail: showEmail !== undefined ? Boolean(showEmail) : profile.privacySettings?.showEmail,
      showIncome: showIncome !== undefined ? Boolean(showIncome) : profile.privacySettings?.showIncome,
      photoVisibility: photoVisibility || profile.privacySettings?.photoVisibility || 'all',
      profileVisibility: profileVisibility || profile.privacySettings?.profileVisibility || 'all',
    };

    await profile.save();

    res.json({ message: 'Privacy settings updated', privacySettings: profile.privacySettings });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ message: 'Server error updating privacy settings' });
  }
};

// ==================== DEFAULT EXPORT ====================

export default {
  getMyProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  getCompletion,
  getProfileById,
  uploadPhotos,
  deletePhoto,
  setProfilePhoto,
  updatePartnerPreferences,
  updatePrivacySettings,
};