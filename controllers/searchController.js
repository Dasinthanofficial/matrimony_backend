// ===== FIXED FILE: ./controllers/searchController.js =====
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import Interest from '../models/Interest.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';
import { LIMITS } from '../utils/constants.js';
import { applyProfilePrivacy } from '../utils/privacy.js';

const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const parseBool = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v || '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const buildMatchSet = async (viewerId, candidateUserIds) => {
  if (!viewerId || !candidateUserIds?.length) return new Set();

  const edges = await Interest.find({
    status: 'accepted',
    $or: [
      { senderId: viewerId, receiverId: { $in: candidateUserIds } },
      { receiverId: viewerId, senderId: { $in: candidateUserIds } },
    ],
  })
    .select('senderId receiverId')
    .lean();

  const viewerStr = viewerId.toString();
  const set = new Set();

  for (const e of edges) {
    const s = e.senderId.toString();
    const r = e.receiverId.toString();
    const other = s === viewerStr ? r : s;
    set.add(other);
  }

  return set;
};

const formatProfileWithUserData = async (profile, viewer) => {
  const user = await User.findById(profile.userId)
    .select('_id isPremium isEmailVerified isPhoneVerified createdAt role subscription premiumExpiry')
    .lean()
    .catch(() => null);

  let photoUrl = null;
  if (profile.photos?.length > 0) {
    const mainPhoto = profile.photos.find((p) => p.isProfile) || profile.photos[0];
    photoUrl = mainPhoto?.url || null;
  }

  const isVerified = Boolean(profile.isVerified || user?.isEmailVerified || user?.isPhoneVerified);

  const raw = {
    _id: profile._id,
    id: profile.userId,
    userId: profile.userId,
    role: user?.role || 'user',
    isPremium: user?.isPremium || false,
    isEmailVerified: user?.isEmailVerified || false,
    isPhoneVerified: user?.isPhoneVerified || false,
    isVerified,
    createdAt: user?.createdAt || profile.createdAt,
    profileId: profile.profileId || profile._id?.toString(),
    fullName: profile.fullName,
    age: profile.age,
    gender: profile.gender,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    citizenship: profile.citizenship,
    occupation: profile.occupation,
    education: profile.education,
    religion: profile.religion,
    caste: profile.caste,
    maritalStatus: profile.maritalStatus,
    diet: profile.diet,
    smoking: profile.smoking,
    drinking: profile.drinking,
    height: profile.height,
    weight: profile.weight,
    bodyType: profile.bodyType,
    bio: profile.bio,
    annualIncome: profile.annualIncome,
    photoUrl,
    photos: profile.photos || [],
    completionPercentage: profile.completionPercentage || 0,
    completionDetails: profile.completionDetails || {},
    lastActive: profile.lastActive,
    privacySettings: profile.privacySettings,
    // ✅ FIX: pass agency tag through for ProfileCard
    isAgencyManaged: profile.isAgencyManaged || false,
    agencyId: profile.agencyId || null,
    agencyNameTag: profile.agencyNameTag || null,
    successFee: profile.successFee,
    successFeeCurrency: profile.successFeeCurrency,
  };

  const matchSet = await buildMatchSet(viewer?._id, [profile.userId]);
  const isMatch = matchSet.has(profile.userId?.toString());

  const safe = applyProfilePrivacy({ viewer, profile: raw, isMatch });
  delete safe.privacySettings;
  if (safe.photosLocked) safe.photoUrl = null;

  return safe;
};

const formatProfilesWithUserData = async (profiles, viewer) => {
  if (!profiles || profiles.length === 0) return [];

  const userIds = profiles.map((p) => p.userId).filter(Boolean);

  const users = await User.find({ _id: { $in: userIds } })
    .select('_id isPremium isEmailVerified isPhoneVerified createdAt role subscription premiumExpiry')
    .lean();

  const userMap = {};
  users.forEach((u) => {
    userMap[u._id.toString()] = u;
  });

  const matchSet = await buildMatchSet(viewer?._id, userIds);

  return profiles.map((profile) => {
    const user = userMap[profile.userId?.toString()] || null;

    let photoUrl = null;
    if (profile.photos?.length > 0) {
      const mainPhoto = profile.photos.find((p) => p.isProfile) || profile.photos[0];
      photoUrl = mainPhoto?.url || null;
    }

    const isVerified = Boolean(profile.isVerified || user?.isEmailVerified || user?.isPhoneVerified);

    const raw = {
      _id: profile._id,
      id: profile.userId,
      userId: profile.userId,
      role: user?.role || 'user',
      isPremium: user?.isPremium || false,
      isEmailVerified: user?.isEmailVerified || false,
      isPhoneVerified: user?.isPhoneVerified || false,
      isVerified,
      createdAt: user?.createdAt || profile.createdAt,
      profileId: profile.profileId || profile._id?.toString(),
      fullName: profile.fullName,
      age: profile.age,
      gender: profile.gender,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      citizenship: profile.citizenship,
      occupation: profile.occupation,
      education: profile.education,
      religion: profile.religion,
      caste: profile.caste,
      maritalStatus: profile.maritalStatus,
      diet: profile.diet,
      smoking: profile.smoking,
      drinking: profile.drinking,
      height: profile.height,
      weight: profile.weight,
      bodyType: profile.bodyType,
      bio: profile.bio,
      annualIncome: profile.annualIncome,
      photoUrl,
      photos: profile.photos || [],
      completionPercentage: profile.completionPercentage || 0,
      completionDetails: profile.completionDetails || {},
      lastActive: profile.lastActive,
      privacySettings: profile.privacySettings,
      isAgencyManaged: profile.isAgencyManaged || false,
      agencyId: profile.agencyId || null,
      agencyNameTag: profile.agencyNameTag || null,
      successFee: profile.successFee,
      successFeeCurrency: profile.successFeeCurrency,
    };

    const isMatch = matchSet.has(profile.userId?.toString());
    const safe = applyProfilePrivacy({ viewer, profile: raw, isMatch });
    delete safe.privacySettings;
    if (safe.photosLocked) safe.photoUrl = null;
    return safe;
  });
};

// ✅ FIX: Base query that excludes inactive / unapproved profiles
const baseSearchFilter = (viewerId) => ({
  userId: { $ne: viewerId },
  isActive: { $ne: false },
});

// ==================== CONTROLLERS ====================

export const searchProfiles = async (req, res) => {
  try {
    const viewer = req.user;
    const viewerId = viewer?._id || viewer?.id;

    const { page, limit, skip } = parsePagination(req.query, {
      maxLimit: LIMITS.MAX_LIMIT_SEARCH,
    });

    const {
      gender, minAge, maxAge, religion, caste, city, state,
      education, occupation, maritalStatus, diet, smoking, drinking,
      country, citizenship, excludeCountry, nativeSriLankan, sriLankanAbroad,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = req.query;

    // ✅ FIX: use base filter
    const query = baseSearchFilter(viewerId);

    if (gender && gender !== 'all') query.gender = gender;

    if (minAge || maxAge) {
      query.age = {};
      if (minAge) query.age.$gte = parseInt(minAge, 10);
      if (maxAge) query.age.$lte = parseInt(maxAge, 10);
    }

    if (religion && religion !== '') query.religion = { $regex: escapeRegex(religion), $options: 'i' };
    if (caste && caste !== '') query.caste = { $regex: escapeRegex(caste), $options: 'i' };
    if (city && city !== '') query.city = { $regex: escapeRegex(city), $options: 'i' };
    if (state && state !== '') query.state = { $regex: escapeRegex(state), $options: 'i' };
    if (occupation && occupation !== '') query.occupation = { $regex: escapeRegex(occupation), $options: 'i' };
    if (education && education !== '') query.education = education;
    if (maritalStatus && maritalStatus !== '') query.maritalStatus = maritalStatus;
    if (diet && diet !== '') query.diet = diet;
    if (smoking && smoking !== '') query.smoking = smoking;
    if (drinking && drinking !== '') query.drinking = drinking;
    if (country && country !== '') query.country = { $regex: escapeRegex(country), $options: 'i' };
    if (citizenship && citizenship !== '') query.citizenship = { $regex: escapeRegex(citizenship), $options: 'i' };

    if (excludeCountry && excludeCountry !== '') {
      query.country = { $ne: String(excludeCountry).trim() };
    }

    if (parseBool(nativeSriLankan)) {
      query.citizenship = 'Sri Lanka';
    }

    if (parseBool(sriLankanAbroad)) {
      query.citizenship = 'Sri Lanka';
      query.country = { $ne: 'Sri Lanka' };
    }

    const allowedSortFields = ['createdAt', 'age', 'completionPercentage', 'lastActive'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

    const [profiles, total] = await Promise.all([
      Profile.find(query).sort(sort).skip(skip).limit(limit).select('-partnerPreferences').lean(),
      Profile.countDocuments(query),
    ]);

    const formattedProfiles = await formatProfilesWithUserData(profiles, viewer);

    res.json({
      success: true,
      profiles: formattedProfiles,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Search profiles');
  }
};

export const quickSearch = async (req, res) => {
  try {
    const viewer = req.user;
    const viewerId = viewer?._id || viewer?.id;

    const { page, limit, skip } = parsePagination(req.query, {
      maxLimit: LIMITS.MAX_LIMIT_SEARCH,
      defaultLimit: 12,
    });

    const { gender, minAge, maxAge, religion, city, country, citizenship } = req.query;

    const query = baseSearchFilter(viewerId);

    if (gender && gender !== 'all') query.gender = gender;
    if (minAge || maxAge) {
      query.age = {};
      if (minAge) query.age.$gte = parseInt(minAge, 10);
      if (maxAge) query.age.$lte = parseInt(maxAge, 10);
    }
    if (religion && religion !== '') query.religion = { $regex: escapeRegex(religion), $options: 'i' };
    if (city && city !== '') query.city = { $regex: escapeRegex(city), $options: 'i' };
    if (country && country !== '') query.country = { $regex: escapeRegex(country), $options: 'i' };
    if (citizenship && citizenship !== '') query.citizenship = { $regex: escapeRegex(citizenship), $options: 'i' };

    const [profiles, total] = await Promise.all([
      Profile.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-partnerPreferences').lean(),
      Profile.countDocuments(query),
    ]);

    const formattedProfiles = await formatProfilesWithUserData(profiles, viewer);

    res.json({
      success: true,
      profiles: formattedProfiles,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Quick search');
  }
};

export const getSuggestedProfiles = async (req, res) => {
  try {
    const viewer = req.user;
    const viewerId = viewer?._id || viewer?.id;
    const limitNum = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const query = baseSearchFilter(viewerId);

    const profiles = await Profile.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select('-partnerPreferences')
      .lean();

    const formattedProfiles = await formatProfilesWithUserData(profiles, viewer);
    res.json({ success: true, profiles: formattedProfiles });
  } catch (e) {
    handleControllerError(res, e, 'Get suggested profiles');
  }
};

export const getRecentProfiles = async (req, res) => {
  try {
    const viewer = req.user;
    const viewerId = viewer?._id || viewer?.id;
    const limitNum = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const query = baseSearchFilter(viewerId);

    const profiles = await Profile.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .select('-partnerPreferences')
      .lean();

    const formattedProfiles = await formatProfilesWithUserData(profiles, viewer);
    res.json({ success: true, profiles: formattedProfiles });
  } catch (e) {
    handleControllerError(res, e, 'Get recent profiles');
  }
};

export const searchById = async (req, res) => {
  try {
    const viewer = req.user;
    const { profileId } = req.params;

    let profile = await Profile.findOne({ profileId }).lean();
    if (!profile && /^[0-9a-fA-F]{24}$/.test(profileId)) {
      profile = await Profile.findById(profileId).lean();
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    const formattedProfile = await formatProfileWithUserData(profile, viewer);
    return res.json({ success: true, profile: formattedProfile });
  } catch (e) {
    handleControllerError(res, e, 'Search by ID');
  }
};

export const getFilterOptions = async (req, res) => {
  try {
    const country = String(req.query.country || '').trim();
    const filter = country ? { country } : {};

    const [religions, cities, educations, countries, citizenships] = await Promise.all([
      Profile.distinct('religion', filter),
      Profile.distinct('city', filter),
      Profile.distinct('education', filter),
      Profile.distinct('country', {}),
      Profile.distinct('citizenship', {}),
    ]);

    res.json({
      success: true,
      religions: religions.filter(Boolean).sort(),
      cities: cities.filter(Boolean).sort(),
      educations: educations.filter(Boolean).sort(),
      countries: countries.filter(Boolean).sort(),
      citizenships: citizenships.filter(Boolean).sort(),
      maritalStatuses: ['never_married', 'divorced', 'widowed', 'awaiting_divorce', 'annulled'],
      diets: ['vegetarian', 'non_vegetarian', 'eggetarian', 'vegan', 'jain', 'pescatarian'],
      bodyTypes: ['slim', 'average', 'athletic', 'heavy', 'fit'],
    });
  } catch (e) {
    handleControllerError(res, e, 'Get filter options');
  }
};

export default {
  searchProfiles,
  quickSearch,
  getSuggestedProfiles,
  getRecentProfiles,
  searchById,
  getFilterOptions,
};