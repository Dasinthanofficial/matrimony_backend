// server/controllers/agencyMarketplaceController.js
import Agency from '../models/Agency.js';
import AgencyService from '../models/AgencyService.js';
import { toMinor } from '../utils/money.js';

async function getOrCreateAgencyForUser(user) {
  const desiredStatus =
    user?.agencyVerification?.status === 'approved'
      ? 'approved'
      : user?.agencyVerification?.status === 'rejected'
        ? 'rejected'
        : 'pending';

  let agency = await Agency.findOne({ ownerUserId: user._id });

  if (!agency) {
    agency = await Agency.create({
      ownerUserId: user._id,
      name: user.fullName || user.email || 'Agency',
      status: desiredStatus,
    });
    return agency;
  }

  if (agency.status !== desiredStatus) {
    agency.status = desiredStatus;
    await agency.save();
  }

  return agency;
}

export async function listMyServices(req, res) {
  try {
    const agency = await getOrCreateAgencyForUser(req.user);
    const services = await AgencyService.find({ agencyId: agency._id }).sort({ createdAt: -1 });
    return res.json({ services, agency });
  } catch {
    return res.status(500).json({ message: 'Failed to load services' });
  }
}

export async function createService(req, res) {
  try {
    const agency = await getOrCreateAgencyForUser(req.user);
    if (agency.status !== 'approved') return res.status(403).json({ message: 'Agency not approved' });

    const { title, description = '', price, currency = 'LKR' } = req.body;
    if (!title || !Number.isFinite(Number(price))) return res.status(400).json({ message: 'Invalid payload' });

    const cur = String(currency).toUpperCase();
    const major = Number(price);
    const minor = toMinor(major, cur);

    if (!Number.isFinite(minor) || minor < 1) return res.status(400).json({ message: 'Invalid price' });

    const service = await AgencyService.create({
      agencyId: agency._id,
      title: String(title).trim(),
      description: String(description).trim(),
      price: major,
      priceMinor: minor,
      currency: cur,
      isActive: true,
    });

    return res.json({ service });
  } catch {
    return res.status(500).json({ message: 'Failed to create service' });
  }
}

export async function updateService(req, res) {
  try {
    const agency = await getOrCreateAgencyForUser(req.user);
    if (agency.status !== 'approved') return res.status(403).json({ message: 'Agency not approved' });

    const service = await AgencyService.findOne({ _id: req.params.id, agencyId: agency._id });
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const { title, description, price, currency, isActive } = req.body;

    if (title !== undefined) service.title = String(title).trim();
    if (description !== undefined) service.description = String(description).trim();
    if (isActive !== undefined) service.isActive = Boolean(isActive);

    const nextCurrency =
      currency !== undefined ? String(currency).toUpperCase() : String(service.currency || 'LKR').toUpperCase();

    const nextPrice = price !== undefined ? Number(price) : Number(service.price);

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }

    const nextMinor = toMinor(nextPrice, nextCurrency);
    if (!Number.isFinite(nextMinor) || nextMinor < 1) {
      return res.status(400).json({ message: 'Invalid price' });
    }

    service.currency = nextCurrency;
    service.price = nextPrice;
    service.priceMinor = nextMinor;

    await service.save();
    return res.json({ service });
  } catch {
    return res.status(500).json({ message: 'Failed to update service' });
  }
}

export async function deleteService(req, res) {
  try {
    const agency = await getOrCreateAgencyForUser(req.user);
    if (agency.status !== 'approved') return res.status(403).json({ message: 'Agency not approved' });

    const ok = await AgencyService.findOneAndDelete({ _id: req.params.id, agencyId: agency._id });
    if (!ok) return res.status(404).json({ message: 'Service not found' });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: 'Failed to delete service' });
  }
}

// Stripe Connect endpoints (REMOVED)
export async function createConnectAccount(_req, res) {
  return res.status(410).json({ message: 'Stripe Connect removed. This server uses PayHere.' });
}
export async function createOnboardingLink(_req, res) {
  return res.status(410).json({ message: 'Stripe Connect removed. This server uses PayHere.' });
}
export async function getConnectStatus(_req, res) {
  return res.status(410).json({ message: 'Stripe Connect removed. This server uses PayHere.' });
}

// ✅ FIXED: User-side list of active services
// Accepts either Agency._id OR agency userId (ownerUserId)
export async function getAgencyServices(req, res) {
  try {
    const { agencyId } = req.params;

    let agency = await Agency.findById(agencyId);
    if (!agency) {
      agency = await Agency.findOne({ ownerUserId: agencyId });
    }

    if (!agency || agency.status !== 'approved') {
      return res.status(404).json({ message: 'Agency not found' });
    }

    const services = await AgencyService.find({ agencyId: agency._id, isActive: true }).sort({ createdAt: -1 });
    return res.json({ agency: { _id: agency._id, name: agency.name }, services });
  } catch {
    return res.status(500).json({ message: 'Failed to load agency services' });
  }
}