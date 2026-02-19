// ===== FILE: ./controllers/agencyPublicController.js =====
import mongoose from 'mongoose';
import User from '../models/User.js';
import AgencyService from '../models/AgencyService.js';
import Agency from '../models/Agency.js'; // must exist because AgencyService.ref = 'Agency'

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export async function getAgencyPublicServices(req, res) {
  try {
    const { agencyId } = req.params;

    if (!isValidObjectId(agencyId)) {
      return res.status(400).json({ message: 'Invalid agencyId' });
    }

    const id = new mongoose.Types.ObjectId(String(agencyId));

    // Accept either:
    // 1) agencyId = Agency._id (preferred)
    // 2) agencyId = agency User._id (legacy/alternate), then resolve Agency via ownerUserId/userId
    const agency =
      (await Agency.findById(id).lean()) ||
      (await Agency.findOne({
        $or: [{ ownerUserId: id }, { userId: id }, { agencyUserId: id }],
      }).lean());

    if (!agency) {
      // Fallback: if somehow services were saved with a user id in agencyId field
      // (Mongo doesn't enforce refs), still return services if they exist.
      const fallbackServices = await AgencyService.find({ agencyId: id, isActive: true })
        .sort({ createdAt: -1 })
        .lean();

      if (fallbackServices.length > 0) {
        return res.json({
          agency: { _id: id, name: 'Agency' },
          services: fallbackServices,
        });
      }

      return res.status(404).json({ message: 'Agency not found' });
    }

    const agencyOwnerUserId = agency.ownerUserId || agency.userId || agency.agencyUserId || null;

    // If agency owner exists, enforce "approved agency" rule
    let agencyUser = null;
    if (agencyOwnerUserId && isValidObjectId(agencyOwnerUserId)) {
      agencyUser = await User.findOne({
        _id: agencyOwnerUserId,
        role: 'agency',
        'agencyVerification.status': 'approved',
      })
        .select('_id fullName email')
        .lean();

      if (!agencyUser) {
        return res.status(404).json({ message: 'Agency not found or not approved' });
      }
    }

    const services = await AgencyService.find({
      agencyId: agency._id, // MUST be Agency._id
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      agency: {
        _id: agency._id,
        name:
          agencyUser?.fullName ||
          agencyUser?.email ||
          agency.name ||
          agency.agencyName ||
          'Agency',
        ownerUserId: agencyOwnerUserId || undefined,
      },
      services,
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || 'Failed to load services' });
  }
}