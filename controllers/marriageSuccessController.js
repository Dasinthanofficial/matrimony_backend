// ===== FILE: ./controllers/marriageSuccessController.js =====
import mongoose from 'mongoose';
import MarriageSuccess from '../models/MarriageSuccess.js';

/**
 * GET /api/marriage-success/agency/payments
 * Query: page, limit, status
 */
export const getAgencyPayments = async (req, res) => {
  try {
    const agencyId = req.user?._id;
    if (!agencyId) return res.status(401).json({ message: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const skip = (page - 1) * limit;
    const status = (req.query.status || '').trim();

    const filter = { agencyId };
    if (status) filter.status = status;

    const [items, total, agg] = await Promise.all([
      MarriageSuccess.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('userProfileId', 'fullName photos city country')
        .populate('agencyProfileId', 'fullName profileId'),

      MarriageSuccess.countDocuments(filter),

      // Stats by status (match same filter, but without pagination)
      MarriageSuccess.aggregate([
        { $match: filter }, // ✅ FIX: don't call ObjectId() incorrectly; agencyId is already ObjectId
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$successFee' },
            agencyAmount: { $sum: '$agencyAmount' },
            adminAmount: { $sum: '$adminAmount' },
          },
        },
      ]),
    ]);

    const statsByStatus = agg.reduce((acc, row) => {
      acc[row._id] = row;
      return acc;
    }, {});

    const totals = {
      total,
      pending: statsByStatus.pending?.count || 0,
      paid: statsByStatus.paid?.count || 0,
      agencyPaid: statsByStatus.agency_paid?.count || 0,
      totalEarnings: agg.reduce((sum, r) => sum + (r.agencyAmount || 0), 0),
      pendingPayout: statsByStatus.paid?.agencyAmount || 0,
    };

    return res.json({
      success: true,
      data: items,
      stats: totals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('getAgencyPayments error:', err);
    return res.status(500).json({
      message: process.env.NODE_ENV !== 'production' ? err.message : 'Server error',
    });
  }
};

/**
 * GET /api/marriage-success/admin/all
 * Admin listing (filters: status, page, limit)
 */
export const adminListPayments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, parseInt(req.query.limit || '50', 10));
    const skip = (page - 1) * limit;
    const status = (req.query.status || '').trim();

    const filter = {};
    if (status) filter.status = status;

    const [items, total, stats] = await Promise.all([
      MarriageSuccess.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('agencyId', 'fullName agencyName email')
        .populate('agencyProfileId', 'fullName profileId')
        .populate('userId', 'fullName email'),

      MarriageSuccess.countDocuments(filter),

      MarriageSuccess.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$successFee' },
            agencyAmount: { $sum: '$agencyAmount' },
            adminAmount: { $sum: '$adminAmount' },
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      data: items,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('adminListPayments error:', err);
    return res.status(500).json({
      message: process.env.NODE_ENV !== 'production' ? err.message : 'Server error',
    });
  }
};

/**
 * PATCH /api/marriage-success/admin/mark-paid/:id
 * Sets status => agency_paid
 * Body: { payoutReference }
 */
export const adminMarkPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { payoutReference } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid payment id' });
    }

    const payment = await MarriageSuccess.findById(id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    payment.status = 'agency_paid';
    if (payoutReference) payment.agencyPayoutReference = payoutReference;

    await payment.save();

    return res.json({ success: true, message: 'Marked as paid', data: payment });
  } catch (err) {
    console.error('adminMarkPaid error:', err);
    return res.status(500).json({
      message: process.env.NODE_ENV !== 'production' ? err.message : 'Server error',
    });
  }
};