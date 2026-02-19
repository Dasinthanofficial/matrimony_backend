// controllers/agencyDashboardController.js
import mongoose from 'mongoose';

/**
 * We use safe dynamic imports so this endpoint doesn't hard-crash
 * if a model filename differs slightly in your repo.
 * Node will cache modules after first import.
 */
const _modCache = new Map();
async function safeImport(relPath) {
  if (_modCache.has(relPath)) return _modCache.get(relPath);
  try {
    const mod = await import(relPath);
    _modCache.set(relPath, mod);
    return mod;
  } catch {
    _modCache.set(relPath, null);
    return null;
  }
}

const sumNumber = (arr) => arr.reduce((s, n) => s + (Number(n) || 0), 0);

export async function getAgencyOverview(req, res) {
  try {
    const agencyUserId = req.user?._id;
    if (!agencyUserId || !mongoose.Types.ObjectId.isValid(agencyUserId)) {
      return res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    // ===== Load models =====
    const Profile = (await safeImport('../models/Profile.js'))?.default;

    // ✅ NEW: Agency model (to map ownerUserId -> Agency._id)
    const Agency = (await safeImport('../models/Agency.js'))?.default;

    // Marketplace
    const AgencyService = (await safeImport('../models/AgencyService.js'))?.default;
    const AgencyOrder = (await safeImport('../models/AgencyOrder.js'))?.default;

    // Reputation
    const AgencyReputation = (await safeImport('../models/AgencyReputation.js'))?.default;

    // Marriage success payments
    const MarriageSuccessPayment =
      (await safeImport('../models/MarriageSuccessPayment.js'))?.default ||
      (await safeImport('../models/MarriageSuccess.js'))?.default ||
      null;

    if (!Profile) {
      return res.status(500).json({
        message: 'Server configuration error (Profile model missing)',
        code: 'MODEL_MISSING',
        model: 'Profile',
      });
    }

    // ✅ Resolve Agency doc (used by services/orders which store Agency._id)
    let agencyDoc = null;
    try {
      if (Agency) {
        agencyDoc = await Agency.findOne({ ownerUserId: agencyUserId }).select('_id name status').lean();
      }
    } catch {
      agencyDoc = null;
    }
    const agencyDocId = agencyDoc?._id || null;

    // ===== PROFILES (agency-managed profiles) =====
    // NOTE: Profile.agencyId is agency USER id in your current schema.
    const profileMatch = { isAgencyManaged: true, agencyId: agencyUserId };

    const [profileAgg] = await Profile.aggregate([
      { $match: profileMatch },
      {
        $group: {
          _id: null,
          totalProfiles: { $sum: 1 },
          activeProfiles: {
            $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] },
          },
          totalViews: { $sum: { $ifNull: ['$profileViews', 0] } },
        },
      },
    ]);

    const recentProfiles = await Profile.find(profileMatch)
      .sort({ createdAt: -1 })
      .limit(6)
      .select(
        'fullName profileId isActive profileViews city country gender age dateOfBirth photos successFee successFeeCurrency createdAt'
      )
      .lean();

    // ===== SERVICES =====
    let services = [];
    let servicesStats = { total: 0, active: 0 };

    // ✅ FIX: AgencyService.agencyId refers to Agency._id (NOT agency userId)
    if (AgencyService && agencyDocId) {
      services = await AgencyService.find({ agencyId: agencyDocId }).sort({ updatedAt: -1 }).limit(10).lean();
      servicesStats.total = services.length;
      servicesStats.active = services.filter((s) => s?.isActive !== false).length;
    }

    // ===== ORDERS =====
    let recentOrders = [];
    let orderStats = {
      total: 0,
      paid: 0,
      unpaid: 0,
      byStatus: {},
      byPaymentStatus: {},
    };

    // ✅ FIX: AgencyOrder.agencyId refers to Agency._id (NOT agency userId)
    if (AgencyOrder && agencyDocId) {
      recentOrders = await AgencyOrder.find({ agencyId: agencyDocId }).sort({ createdAt: -1 }).limit(10).lean();

      const [orderAgg] = await AgencyOrder.aggregate([
        { $match: { agencyId: agencyDocId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
            unpaid: { $sum: { $cond: [{ $ne: ['$paymentStatus', 'paid'] }, 1, 0] } },
          },
        },
      ]);

      const byStatusAgg = await AgencyOrder.aggregate([
        { $match: { agencyId: agencyDocId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const byPaymentAgg = await AgencyOrder.aggregate([
        { $match: { agencyId: agencyDocId } },
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]);

      const base = orderAgg || {};
      orderStats.total = base.total || 0;
      orderStats.paid = base.paid || 0;
      orderStats.unpaid = base.unpaid || 0;

      orderStats.byStatus = Object.fromEntries(byStatusAgg.map((x) => [x._id || 'unknown', x.count || 0]));
      orderStats.byPaymentStatus = Object.fromEntries(byPaymentAgg.map((x) => [x._id || 'unknown', x.count || 0]));
    }

    // ===== MARRIAGE SUCCESS CLAIMS / PAYMENTS =====
    // NOTE: Your MarriageSuccess controller uses agencyId = req.user._id (agency userId).
    // Keep that here to match your current stored data.
    let successStats = {
      total: 0,
      byStatus: {},
      totals: {
        currency: 'LKR',
        successFee: 0,
        adminAmount: 0,
        agencyAmount: 0,
      },
      pendingPayout: 0,
      paidOut: 0,
      recent: [],
    };

    if (MarriageSuccessPayment) {
      const match = { agencyId: agencyUserId };

      const [tot] = await MarriageSuccessPayment.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successFee: { $sum: { $ifNull: ['$successFee', 0] } },
            adminAmount: { $sum: { $ifNull: ['$adminAmount', 0] } },
            agencyAmount: { $sum: { $ifNull: ['$agencyAmount', 0] } },
          },
        },
      ]);

      const byStatus = await MarriageSuccessPayment.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            agencyAmount: { $sum: { $ifNull: ['$agencyAmount', 0] } },
          },
        },
      ]);

      const pendingPayout = sumNumber(byStatus.filter((x) => x._id === 'paid').map((x) => x.agencyAmount));
      const paidOut = sumNumber(byStatus.filter((x) => x._id === 'agency_paid').map((x) => x.agencyAmount));

      const recent = await MarriageSuccessPayment.find(match).sort({ createdAt: -1 }).limit(10).lean();

      successStats.total = tot?.total || 0;
      successStats.byStatus = Object.fromEntries(byStatus.map((x) => [x._id || 'unknown', x.count || 0]));
      successStats.totals.currency = (recent?.[0]?.currency || 'LKR').toUpperCase?.() || 'LKR';
      successStats.totals.successFee = tot?.successFee || 0;
      successStats.totals.adminAmount = tot?.adminAmount || 0;
      successStats.totals.agencyAmount = tot?.agencyAmount || 0;
      successStats.pendingPayout = pendingPayout || 0;
      successStats.paidOut = paidOut || 0;
      successStats.recent = recent;
    }

    // ===== REPUTATION =====
    // Your reputation docs might be keyed by Agency._id OR agency userId depending on how you wrote them.
    let reputation = null;
    if (AgencyReputation) {
      reputation =
        (agencyDocId ? await AgencyReputation.findOne({ agencyId: agencyDocId }).lean() : null) ||
        (await AgencyReputation.findOne({ agencyId: agencyUserId }).lean());
    }

    // ===== VERIFIED BADGE / LEVEL =====
    const verifiedBadge =
      reputation?.verifiedBadge ||
      req.user?.verifiedBadge ||
      req.user?.agencyVerifiedBadge ||
      { isActive: !!req.user?.isVerifiedBadge };

    const agencyLevel = reputation?.agencyLevel || req.user?.agencyLevel || null;

    // ===== KPIs =====
    const kpis = {
      profiles: {
        total: profileAgg?.totalProfiles || 0,
        active: profileAgg?.activeProfiles || 0,
      },
      profileViews: {
        total: profileAgg?.totalViews || 0,
        today: null,
        last7d: null,
      },
      earnings: {
        currency: successStats.totals.currency || 'LKR',
        totalAgency: successStats.totals.agencyAmount || 0,
        totalAdmin: successStats.totals.adminAmount || 0,
        totalGross: successStats.totals.successFee || 0,
      },
      pendingPayout: {
        currency: successStats.totals.currency || 'LKR',
        amount: successStats.pendingPayout || 0,
      },
      paidOut: {
        currency: successStats.totals.currency || 'LKR',
        amount: successStats.paidOut || 0,
      },
      transactions: {
        total: successStats.total || 0,
      },
      orders: {
        total: orderStats.total,
        paid: orderStats.paid,
        unpaid: orderStats.unpaid,
      },
      rating: {
        avg: reputation?.ratingAvg ?? null,
        count: reputation?.ratingCount ?? null,
      },
      agencyLevel,
      verifiedBadge,
    };

    return res.json({
      agency: {
        agencyUserId: agencyUserId.toString(),
        // ✅ include canonical Agency doc id for marketplace data
        agencyId: agencyDocId ? agencyDocId.toString() : null,
        name: req.user?.fullName || agencyDoc?.name || req.user?.agencyName || null,
        email: req.user?.email || null,
        agencyVerification: req.user?.agencyVerification || null,
      },
      kpis,
      profiles: {
        ...kpis.profiles,
        totalViews: kpis.profileViews.total,
        recent: recentProfiles,
      },
      services: {
        ...servicesStats,
        recent: services,
      },
      orders: {
        ...orderStats,
        recent: recentOrders,
      },
      success: successStats,
      reputation,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('getAgencyOverview error:', e);
    return res.status(500).json({ message: 'Failed to load agency overview', code: 'AGENCY_OVERVIEW_FAILED' });
  }
}