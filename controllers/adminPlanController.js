// server/controllers/adminPlanController.js
import SubscriptionPlan from '../models/SubscriptionPlan.js';

function minorDigits(currency) {
  const c = String(currency || '').toUpperCase();
  // common 0-decimal currencies (extend if you need)
  if (['JPY', 'KRW', 'VND'].includes(c)) return 0;
  return 2; // LKR, USD, EUR, GBP etc.
}

function toMinor(amountMajor, currency) {
  const d = minorDigits(currency);
  const n = Number(amountMajor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * Math.pow(10, d));
}

function normalizeFeatures(features) {
  if (!features) return [];
  if (Array.isArray(features)) return features.map((f) => String(f).trim()).filter(Boolean);
  return String(features)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// GET /api/admin/plans
export async function listPlans(req, res) {
  try {
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, createdAt: -1 });
    return res.json({ plans });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load plans' });
  }
}

// POST /api/admin/plans
export async function createPlan(req, res) {
  try {
    const {
      code,
      name,
      description = '',
      interval,
      intervalCount = 1,
      currency = 'LKR',
      price,
      features = [],
      isActive = true,
      sortOrder = 0,
    } = req.body || {};

    if (!code || !name || !interval || price === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const cur = String(currency).toUpperCase();
    const major = Number(price);
    if (!Number.isFinite(major) || major < 0) return res.status(400).json({ message: 'Invalid price' });

    const plan = await SubscriptionPlan.create({
      code: String(code).trim(),
      name: String(name).trim(),
      description: String(description).trim(),
      interval: String(interval),
      intervalCount: String(interval) === 'lifetime' ? 1 : Math.max(1, Number(intervalCount) || 1),
      currency: cur,
      price: major,
      priceMinor: toMinor(major, cur),
      features: normalizeFeatures(features),
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder) || 0,
    });

    return res.json({ plan });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Plan code already exists' });
    return res.status(500).json({ message: 'Failed to create plan' });
  }
}

// PUT /api/admin/plans/:planId
export async function updatePlan(req, res) {
  try {
    const { planId } = req.params;
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const patch = req.body || {};

    if (patch.code !== undefined) plan.code = String(patch.code).trim();
    if (patch.name !== undefined) plan.name = String(patch.name).trim();
    if (patch.description !== undefined) plan.description = String(patch.description).trim();

    if (patch.interval !== undefined) plan.interval = String(patch.interval);

    if (patch.intervalCount !== undefined) {
      plan.intervalCount =
        String(plan.interval) === 'lifetime' ? 1 : Math.max(1, Number(patch.intervalCount) || 1);
    }

    if (patch.currency !== undefined) plan.currency = String(patch.currency).toUpperCase();
    if (patch.features !== undefined) plan.features = normalizeFeatures(patch.features);
    if (patch.isActive !== undefined) plan.isActive = Boolean(patch.isActive);
    if (patch.sortOrder !== undefined) plan.sortOrder = Number(patch.sortOrder) || 0;

    if (patch.price !== undefined) {
      const major = Number(patch.price);
      if (!Number.isFinite(major) || major < 0) return res.status(400).json({ message: 'Invalid price' });
      plan.price = major;
      plan.priceMinor = toMinor(major, plan.currency);
    }

    if (String(plan.interval) === 'lifetime') plan.intervalCount = 1;

    await plan.save();
    return res.json({ plan });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Plan code already exists' });
    return res.status(500).json({ message: 'Failed to update plan' });
  }
}

// PATCH /api/admin/plans/:planId/toggle
export async function togglePlan(req, res) {
  try {
    const { planId } = req.params;
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    plan.isActive = !plan.isActive;
    await plan.save();

    return res.json({ plan });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to toggle plan' });
  }
}

// DELETE /api/admin/plans/:planId
export async function deletePlan(req, res) {
  try {
    const { planId } = req.params;
    const ok = await SubscriptionPlan.findByIdAndDelete(planId);
    if (!ok) return res.status(404).json({ message: 'Plan not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete plan' });
  }
}

// PUT /api/admin/plans/reorder
// Body: { orderedIds: ["id1","id2"] } OR { plans: [{_id, sortOrder}] }
export async function reorderPlans(req, res) {
  try {
    const { orderedIds, plans } = req.body || {};

    if (Array.isArray(orderedIds) && orderedIds.length) {
      await SubscriptionPlan.bulkWrite(
        orderedIds.map((id, idx) => ({
          updateOne: { filter: { _id: id }, update: { $set: { sortOrder: idx } } },
        }))
      );
      return res.json({ success: true });
    }

    if (Array.isArray(plans) && plans.length) {
      await SubscriptionPlan.bulkWrite(
        plans.map((p) => ({
          updateOne: {
            filter: { _id: p._id },
            update: { $set: { sortOrder: Number(p.sortOrder) || 0 } },
          },
        }))
      );
      return res.json({ success: true });
    }

    return res.status(400).json({ message: 'Invalid reorder payload' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to reorder plans' });
  }
}

// default export (optional, helps if somewhere else does default import)
export default {
  listPlans,
  createPlan,
  updatePlan,
  togglePlan,
  deletePlan,
  reorderPlans,
};