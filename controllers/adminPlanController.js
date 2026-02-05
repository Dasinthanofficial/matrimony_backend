import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import AdminLog from '../models/AdminLog.js';

const log = async (req, action, planId, metadata = {}) => {
  try {
    await AdminLog.create({
      adminId: req.user._id,
      action,
      targetUserId: null,
      reason: null,
      metadata: { planId, ...metadata },
      ipAddress: req?.ip,
      userAgent: req?.get?.('user-agent'),
    });
  } catch (_) {}
};

const normalizePrice = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[String(k).toUpperCase()] = n;
  }
  return Object.keys(out).length ? out : null;
};

export const listPlans = async (_req, res) => {
  try {
    const plans = await Plan.find({}).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ plans });
  } catch (e) {
    res.status(500).json({ message: 'Error fetching plans', error: e.message });
  }
};

export const createPlan = async (req, res) => {
  try {
    const { name, slug, duration, price } = req.body || {};
    if (!name || !slug) return res.status(400).json({ message: 'name and slug are required' });
    if (!duration?.value || !duration?.unit) {
      return res.status(400).json({ message: 'duration.value and duration.unit are required' });
    }

    const normalizedPrice = normalizePrice(price);
    if (!normalizedPrice) return res.status(400).json({ message: 'Valid price required, ex: { INR: 999 }' });

    const exists = await Plan.findOne({ slug });
    if (exists) return res.status(400).json({ message: 'slug already exists' });

    const plan = await Plan.create({
      name,
      slug,
      description: req.body.description || '',
      price: normalizedPrice,
      discountPrice: normalizePrice(req.body.discountPrice) || undefined,
      duration: { value: Number(duration.value), unit: duration.unit },
      features: req.body.features && typeof req.body.features === 'object' ? req.body.features : {},
      recommended: !!req.body.recommended,
      isActive: req.body.isActive !== false,
      sortOrder: Number(req.body.sortOrder) || 0,
    });

    await log(req, 'plan_created', plan._id.toString(), { slug: plan.slug });
    res.status(201).json({ plan });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Duplicate key (slug probably exists)' });
    res.status(500).json({ message: 'Error creating plan', error: e.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Invalid planId' });

    const updates = { ...req.body };

    if (updates.price !== undefined) {
      const normalizedPrice = normalizePrice(updates.price);
      if (!normalizedPrice) return res.status(400).json({ message: 'Invalid price object' });
      updates.price = normalizedPrice;
    }

    if (updates.discountPrice !== undefined) {
      updates.discountPrice = normalizePrice(updates.discountPrice) || undefined;
    }

    if (updates.duration !== undefined) {
      if (!updates.duration?.value || !updates.duration?.unit) {
        return res.status(400).json({ message: 'duration.value and duration.unit are required' });
      }
      updates.duration = { value: Number(updates.duration.value), unit: updates.duration.unit };
    }

    if (updates.slug) {
      const exists = await Plan.findOne({ slug: updates.slug, _id: { $ne: planId } });
      if (exists) return res.status(400).json({ message: 'slug already exists' });
    }

    const plan = await Plan.findByIdAndUpdate(planId, updates, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    await log(req, 'plan_updated', planId, { fields: Object.keys(updates) });
    res.json({ plan });
  } catch (e) {
    res.status(500).json({ message: 'Error updating plan', error: e.message });
  }
};

export const togglePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    plan.isActive = !plan.isActive;
    await plan.save();

    await log(req, plan.isActive ? 'plan_activated' : 'plan_deactivated', planId);
    res.json({ plan });
  } catch (e) {
    res.status(500).json({ message: 'Error toggling plan', error: e.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    // soft delete
    plan.isActive = false;
    await plan.save();

    await log(req, 'plan_deleted_soft', planId);
    res.json({ message: 'Plan deactivated', plan });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting plan', error: e.message });
  }
};

export const reorderPlans = async (req, res) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ message: 'order must be an array of planIds' });
    }

    const ops = order
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id, idx) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: idx } } },
      }));

    if (ops.length === 0) return res.status(400).json({ message: 'No valid planIds provided' });

    await Plan.bulkWrite(ops);

    await log(req, 'plans_reordered', null, { count: ops.length });

    const plans = await Plan.find({}).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ plans });
  } catch (e) {
    res.status(500).json({ message: 'Error reordering plans', error: e.message });
  }
};