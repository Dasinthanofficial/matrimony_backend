// ===== FILE: ./controllers/agencyProfileController.js =====
import crypto from 'crypto';
import mongoose from 'mongoose';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

const generateProfileId = () => {
  const prefix = 'MAT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

/**
 * GET /api/agency/profiles
 */
export const getMyAgencyProfiles = async (req, res) => {
  try {
    const agencyId = req.user?._id;
    if (!agencyId) return res.status(401).json({ message: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;

    // ✅ FIX: include legacy profiles that might not have isAgencyManaged set
    const filter = {
      agencyId,
      $or: [{ isAgencyManaged: true }, { isAgencyManaged: { $exists: false } }],
    };

    const [profiles, total] = await Promise.all([
      Profile.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Profile.countDocuments(filter),
    ]);

    res.json({
      profiles,
      pagination: { page, limit, totalPages: Math.ceil(total / limit), total },
    });
  } catch (err) {
    console.error('getMyAgencyProfiles', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/agency/profiles
 * Creates an agency-managed profile + a managed User record.
 */
export const createAgencyProfile = async (req, res) => {
  try {
    const agencyId = req.user?._id;
    if (!agencyId) return res.status(401).json({ message: 'Unauthorized' });

    const b = req.body || {};
    const required = ['fullName', 'gender', 'dateOfBirth', 'maritalStatus', 'religion', 'country', 'city'];

    for (const k of required) {
      if (!b[k] || (typeof b[k] === 'string' && !String(b[k]).trim())) {
        return res.status(400).json({ message: `Missing required field: ${k}` });
      }
    }

    const gender = String(b.gender).toLowerCase();
    if (!['male', 'female'].includes(gender)) {
      return res.status(400).json({ message: 'gender must be male or female' });
    }

    const age = calculateAge(b.dateOfBirth);
    if (age != null && age < 18) return res.status(400).json({ message: 'User must be at least 18 years old' });

    const successFee = Number(b.successFee || 0);
    if (!Number.isFinite(successFee) || successFee <= 0) {
      return res.status(400).json({ message: 'successFee must be a positive number' });
    }

    // create managed user (cannot login: login blocks isManagedProfile)
    const randomPassword = crypto.randomBytes(16).toString('hex');

    const managedUser = await User.create({
      password: randomPassword,
      role: 'user',
      isManagedProfile: true,
      managedByAgencyId: agencyId,
      fullName: String(b.fullName).trim(),
      isActive: true,
    });

    const profile = await Profile.create({
      userId: managedUser._id,
      profileId: generateProfileId(),

      agencyId,
      agencyNameTag: req.user?.fullName || req.user?.email || null,
      isAgencyManaged: true,

      successFee,
      successFeeCurrency: String(b.successFeeCurrency || 'LKR').toUpperCase(),

      fullName: String(b.fullName).trim(),
      gender,
      dateOfBirth: new Date(b.dateOfBirth),
      age,
      maritalStatus: String(b.maritalStatus),
      religion: String(b.religion).trim(),
      country: String(b.country).trim(),
      city: String(b.city).trim(),

      bio: b.bio ? String(b.bio).trim() : undefined,
      isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
    });

    await User.findByIdAndUpdate(managedUser._id, { profileId: profile._id });

    return res.status(201).json({ profile });
  } catch (err) {
    console.error('createAgencyProfile', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH/PUT /api/agency/profiles/:id
 */
export const updateAgencyProfile = async (req, res) => {
  try {
    const agencyId = req.user?._id;
    const id = req.params.id;

    if (!agencyId) return res.status(401).json({ message: 'Unauthorized' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid profile id' });

    const profile = await Profile.findById(id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    if (!profile.isAgencyManaged || profile.agencyId?.toString() !== agencyId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const b = req.body || {};
    const updatable = [
      'fullName',
      'gender',
      'dateOfBirth',
      'maritalStatus',
      'religion',
      'country',
      'state',
      'city',
      'bio',
      'isActive',
      'successFee',
      'successFeeCurrency',
    ];

    // Apply updates
    for (const k of updatable) {
      if (b[k] === undefined) continue;
      profile[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
    }

    // Validate gender if provided
    if (b.gender !== undefined) {
      const g = String(profile.gender).toLowerCase();
      if (!['male', 'female'].includes(g)) return res.status(400).json({ message: 'gender must be male or female' });
      profile.gender = g;
    }

    // Recompute age if dob changes
    if (b.dateOfBirth !== undefined) {
      profile.dateOfBirth = new Date(profile.dateOfBirth);
      profile.age = calculateAge(profile.dateOfBirth);
      if (profile.age != null && profile.age < 18) {
        return res.status(400).json({ message: 'User must be at least 18 years old' });
      }
    }

    // Validate success fee
    if (b.successFee !== undefined) {
      const sf = Number(profile.successFee);
      if (!Number.isFinite(sf) || sf <= 0) return res.status(400).json({ message: 'successFee must be > 0' });
    }

    if (b.successFeeCurrency !== undefined) {
      profile.successFeeCurrency = String(profile.successFeeCurrency || 'LKR').toUpperCase();
    }

    await profile.save();
    return res.json({ profile });
  } catch (err) {
    console.error('updateAgencyProfile', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /api/agency/profiles/:id
 */
export const deleteAgencyProfile = async (req, res) => {
  try {
    const agencyId = req.user?._id;
    const id = req.params.id;

    if (!agencyId) return res.status(401).json({ message: 'Unauthorized' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid profile id' });

    const profile = await Profile.findById(id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    if (!profile.isAgencyManaged || profile.agencyId?.toString() !== agencyId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await Profile.findByIdAndDelete(id);

    // best-effort cleanup of managed user record
    try {
      await User.deleteOne({ _id: profile.userId, isManagedProfile: true, managedByAgencyId: agencyId });
    } catch {}

    res.json({ message: 'Profile deleted' });
  } catch (err) {
    console.error('deleteAgencyProfile', err);
    res.status(500).json({ message: 'Server error' });
  }
};