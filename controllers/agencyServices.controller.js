// ===== FIXED FILE: ./controllers/agencyServices.controller.js =====
import Agency from '../models/Agency.js';
import AgencyService from '../models/AgencyService.js';

// ✅ FIX: Helper to compute minor units (cents/paisa) from major units
function toMinor(price, currency = 'LKR') {
  const amount = Number(price) || 0;
  // LKR, USD, EUR, GBP etc. all use 100 subunits
  return Math.round(amount * 100);
}

export async function listMyServices(req, res) {
  const agency = await Agency.findOne({ ownerUserId: req.user._id });
  if (!agency) return res.status(404).json({ message: 'Agency not found' });

  const services = await AgencyService.find({ agencyId: agency._id }).sort({ createdAt: -1 });
  res.json({ services });
}

export async function createService(req, res) {
  const agency = await Agency.findOne({ ownerUserId: req.user._id });
  if (!agency) return res.status(404).json({ message: 'Agency not found' });
  if (agency.status !== 'approved') return res.status(403).json({ message: 'Agency not approved' });

  const { title, description, price, currency } = req.body;
  if (!title || !Number.isFinite(Number(price))) return res.status(400).json({ message: 'Invalid payload' });

  const cur = (currency || 'LKR').toUpperCase();
  const priceNum = Number(price);

  // ✅ FIX: Compute priceMinor so schema validation passes
  const service = await AgencyService.create({
    agencyId: agency._id,
    title: String(title).trim(),
    description: String(description || '').trim(),
    price: priceNum,
    priceMinor: toMinor(priceNum, cur),
    currency: cur,
  });

  res.json({ service });
}

export async function updateService(req, res) {
  const agency = await Agency.findOne({ ownerUserId: req.user._id });
  if (!agency) return res.status(404).json({ message: 'Agency not found' });

  const service = await AgencyService.findOne({ _id: req.params.id, agencyId: agency._id });
  if (!service) return res.status(404).json({ message: 'Service not found' });

  const { title, description, price, currency, isActive } = req.body;

  if (title !== undefined) service.title = String(title).trim();
  if (description !== undefined) service.description = String(description).trim();
  if (currency !== undefined) service.currency = String(currency).toUpperCase();
  if (isActive !== undefined) service.isActive = Boolean(isActive);

  // ✅ FIX: Recompute priceMinor whenever price changes
  if (price !== undefined) {
    service.price = Number(price);
    service.priceMinor = toMinor(service.price, service.currency);
  }

  await service.save();
  res.json({ service });
}

export async function deleteService(req, res) {
  const agency = await Agency.findOne({ ownerUserId: req.user._id });
  if (!agency) return res.status(404).json({ message: 'Agency not found' });

  const service = await AgencyService.findOneAndDelete({ _id: req.params.id, agencyId: agency._id });
  if (!service) return res.status(404).json({ message: 'Service not found' });

  res.json({ success: true });
}