import SubscriptionPlan from '../models/SubscriptionPlan.js';

// GET /api/plans (public)
export async function listPublicPlans(req, res) {
  try {
    const raw = await SubscriptionPlan.find({ isActive: true })
      .sort({ sortOrder: 1, price: 1 })
      .lean();

    const plans = raw.map((p) => {
      const isActive =
        p?.isActive != null ? !!p.isActive :
        p?.isEnabled != null ? !!p.isEnabled :
        true;

      const price =
        p?.price != null ? Number(p.price || 0) :
        p?.priceMajor != null ? Number(p.priceMajor || 0) :
        p?.priceMinor != null ? Number(p.priceMinor || 0) / 100 :
        0;

      let interval = p?.interval;
      let intervalCount = p?.intervalCount;

      const dd =
        p?.durationDays != null ? Number(p.durationDays || 0) :
        p?.days != null ? Number(p.days || 0) :
        null;

      if (!interval) {
        if (dd == null) interval = 'month';
        else if (dd <= 0) interval = 'lifetime';
        else if (dd % 365 === 0) interval = 'year';
        else if (dd % 30 === 0) interval = 'month';
        else interval = 'month';
      }

      if (!intervalCount) {
        if (interval === 'lifetime') intervalCount = 1;
        else if (dd != null && dd > 0 && interval === 'year' && dd % 365 === 0) intervalCount = dd / 365;
        else if (dd != null && dd > 0 && interval === 'month' && dd % 30 === 0) intervalCount = dd / 30;
        else intervalCount = 1;
      }

      return {
        ...p,
        isActive,
        price,
        interval,
        intervalCount,
        currency: String(p?.currency || 'LKR').toUpperCase(),
        features: Array.isArray(p?.features) ? p.features : [],
      };
    });

    return res.json({ plans });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load plans' });
  }
}