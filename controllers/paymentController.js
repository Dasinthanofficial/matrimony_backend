// ===== FILE: ./controllers/paymentController.js =====

import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';
import { hasPremiumAccess } from '../utils/entitlements.js';

// Helper to check if user has unlocked a contact
const hasUnlocked = (user, targetUserId) =>
  user.contactsUnlocked?.some((id) => id.toString() === targetUserId.toString());

// Unlock contact
export const unlockContact = async (req, res) => {
  try {
    const userId = req.user._id;
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const { amount = 99 } = req.body;

    if (!targetUserId) return res.status(400).json({ message: 'Target user ID is required' });
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid target user ID' });
    }
    if (userId.toString() === targetUserId.toString()) {
      return res.status(400).json({ message: 'Cannot unlock your own contact' });
    }

    const targetUser = await User.findById(targetUserId).select('_id');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const user = await User.findById(userId).select('contactsUnlocked isPremium subscription premiumExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (hasUnlocked(user, targetUserId)) {
      return res.status(400).json({ message: 'Contact already unlocked', code: 'ALREADY_UNLOCKED' });
    }

    // Premium users get free unlocks (using correct entitlement logic)
    if (hasPremiumAccess(user)) {
      await User.findByIdAndUpdate(userId, { $addToSet: { contactsUnlocked: targetUserId } });
      return res.json({
        message: 'Contact unlocked (premium benefit)',
        isPremiumUnlock: true,
        targetUserId,
      });
    }

    // 🚨 In production, do not fake-success payments
    const allowMockPayments =
      process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PAYMENTS === 'true';

    if (!allowMockPayments) {
      return res.status(501).json({
        message: 'Contact unlock payment is not configured',
        code: 'PAYMENT_NOT_CONFIGURED',
        hint: 'Implement and verify a real payment gateway/webhook for contact unlocks.',
      });
    }

    const cleanAmount = Math.max(0, Number(amount) || 0);

    // DEV/Mock payment record
    const payment = await Payment.create({
      userId,
      amount: cleanAmount,
      currency: 'INR',
      plan: 'contact_unlock',
      status: 'succeeded',
      description: 'Contact unlock (mock/dev)',
      metadata: {
        targetUserId,
        gateway: 'mock',
      },
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: { contactsUnlocked: targetUserId },
    });

    res.status(201).json({
      message: 'Contact unlocked successfully',
      payment: {
        _id: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      },
      targetUserId,
    });
  } catch (e) {
    handleControllerError(res, e, 'Unlock contact');
  }
};

// Check if contact is unlocked
export const isContactUnlocked = async (req, res) => {
  try {
    const userId = req.user._id;
    const { targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid target user ID' });
    }

    const user = await User.findById(userId).select('contactsUnlocked isPremium subscription premiumExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const premium = hasPremiumAccess(user);
    const isUnlocked = hasUnlocked(user, targetUserId) || premium;

    res.json({
      isUnlocked,
      targetUserId,
      isPremium: premium,
      reason: premium ? 'premium' : isUnlocked ? 'purchased' : 'locked',
    });
  } catch (e) {
    handleControllerError(res, e, 'Check contact unlocked');
  }
};

// Get all unlocked contacts
export const getUnlockedContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query, { maxLimit: 50 });

    const user = await User.findById(userId).populate('contactsUnlocked', 'email phone countryCode').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const allContacts = user.contactsUnlocked || [];
    const total = allContacts.length;

    const paginatedContacts = allContacts.slice(skip, skip + limit);

    const enriched = await Promise.all(
      paginatedContacts.map(async (contact) => {
        const profile = await Profile.findOne({ userId: contact._id }).select('fullName photos').lean();

        return {
          _id: contact._id,
          email: contact.email,
          phone: contact.phone,
          countryCode: contact.countryCode,
          profile: profile
            ? {
                fullName: profile.fullName,
                photoUrl: profile.photos?.find((p) => p.isProfile)?.url || profile.photos?.[0]?.url || null,
              }
            : null,
        };
      })
    );

    res.json({
      contacts: enriched,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get unlocked contacts');
  }
};

// Get contact details (requires unlock or premium)
export const getContactDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid target user ID' });
    }

    const user = await User.findById(userId).select('contactsUnlocked isPremium subscription premiumExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const premium = hasPremiumAccess(user);
    const isUnlocked = hasUnlocked(user, targetUserId) || premium;

    if (!isUnlocked) {
      return res.status(403).json({
        message: 'Contact not unlocked. Purchase unlock or upgrade to premium.',
        code: 'CONTACT_LOCKED',
        isPremium: false,
      });
    }

    const targetUser = await User.findById(targetUserId).select('email phone countryCode');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const profile = await Profile.findOne({ userId: targetUserId }).select('fullName photos').lean();

    res.json({
      contact: {
        email: targetUser.email,
        phone: targetUser.phone,
        countryCode: targetUser.countryCode,
        fullPhone: targetUser.phone ? `${targetUser.countryCode || ''}${targetUser.phone}` : null,
        fullName: profile?.fullName,
        photoUrl: profile?.photos?.find((p) => p.isProfile)?.url || profile?.photos?.[0]?.url || null,
      },
    });
  } catch (e) {
    handleControllerError(res, e, 'Get contact details');
  }
};

// Get payment history
export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);
    const { status = 'all', plan = 'all' } = req.query;

    const filter = { userId };
    if (status !== 'all') filter.status = status;
    if (plan !== 'all') filter.plan = plan;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-metadata.gateway')
        .lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({
      payments,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get payment history');
  }
};

// Get payment by ID
export const getPaymentById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { paymentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ message: 'Invalid payment ID' });
    }

    const payment = await Payment.findOne({ _id: paymentId, userId }).lean();
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    res.json({ payment });
  } catch (e) {
    handleControllerError(res, e, 'Get payment by ID');
  }
};