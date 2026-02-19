// ===== FILE: ./controllers/adminAgencyProfilesController.js =====
import Profile from '../models/Profile.js';
import User from '../models/User.js';

export const getAllAgencyProfiles = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const skip = (page - 1) * limit;

    // Match profiles created/added by an agency (supports common field names)
    const match = {
      $or: [
        { agencyId: { $exists: true, $ne: null } },
        { addedByAgencyId: { $exists: true, $ne: null } },
        { createdByAgencyId: { $exists: true, $ne: null } },
      ],
    };

    const total = await Profile.countDocuments(match);

    // ✅ FULL DETAILS (no select restriction)
    const profiles = await Profile.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    const agencyIds = [
      ...new Set(
        profiles
          .map((p) => String(p.agencyId || p.addedByAgencyId || p.createdByAgencyId || ''))
          .filter(Boolean)
      ),
    ];

    const agencies = agencyIds.length
      ? await User.find({ _id: { $in: agencyIds } }).select('fullName name email role createdAt').lean()
      : [];

    const agencyById = new Map(agencies.map((a) => [String(a._id), a]));

    const shaped = profiles.map((p) => {
      const agencyRef = p.agencyId || p.addedByAgencyId || p.createdByAgencyId;
      return {
        ...p,
        agency: agencyRef ? agencyById.get(String(agencyRef)) || null : null,
      };
    });

    return res.json({ page, limit, total, profiles: shaped });
  } catch (e) {
    console.error('getAllAgencyProfiles error:', e);
    return res.status(500).json({
      message: 'Failed to load agency profiles',
      code: 'ADMIN_AGENCY_PROFILES_FAILED',
      error: process.env.NODE_ENV === 'development' ? String(e?.message || e) : undefined,
    });
  }
};

export default { getAllAgencyProfiles };