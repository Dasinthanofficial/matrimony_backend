// ===== FILE: ./controllers/interestController.js =====
import mongoose from 'mongoose';
import Interest from '../models/Interest.js';
import Shortlist from '../models/Shortlist.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';
import { LIMITS } from '../utils/constants.js';

// Send interest
export const sendInterest = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user._id;

    if (!receiverId) return res.status(400).json({ message: 'Receiver ID required' });
    if (!mongoose.Types.ObjectId.isValid(receiverId)) return res.status(400).json({ message: 'Invalid receiver ID' });
    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({ message: 'Cannot send interest to yourself' });
    }

    if (message && message.length > LIMITS.MAX_INTEREST_MESSAGE) {
      return res.status(400).json({ message: `Message too long (max ${LIMITS.MAX_INTEREST_MESSAGE} characters)` });
    }

    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) return res.status(404).json({ message: 'User not found' });

    // Check if receiver has blocked sender (reverse direction)
    const blockedByReceiver = await Interest.findOne({
      senderId: receiverId,
      receiverId: senderId,
      status: 'blocked',
    }).lean();

    if (blockedByReceiver) {
      return res.status(403).json({ message: 'Cannot send interest to this user' });
    }

    const existing = await Interest.findOne({ senderId, receiverId }).lean();
    if (existing) {
      return res.status(400).json({
        message: 'Interest already sent',
        status: existing.status,
        interestId: existing._id,
      });
    }

    const [senderProfile, receiverProfile] = await Promise.all([
      Profile.findOne({ userId: senderId }).select('_id fullName').lean(),
      Profile.findOne({ userId: receiverId }).select('_id fullName').lean(),
    ]);

    const interest = await Interest.create({
      senderId,
      receiverId,
      senderProfileId: senderProfile?._id,
      receiverProfileId: receiverProfile?._id,
      message: message?.trim(),
    });

    // ✅ Notification to receiver (best effort)
    try {
      await Notification.create({
        userId: receiverId,
        type: 'interest_received',
        title: 'New interest received',
        message: `${senderProfile?.fullName || 'Someone'} sent you an interest.`,
        relatedUserId: senderId,
        relatedProfileId: senderProfile?._id,
        relatedInterestId: interest._id,
        actionUrl: '/interests',
        metadata: { status: 'pending' },
      });
    } catch {
      // ignore
    }

    res.status(201).json({ message: 'Interest sent successfully', interest });
  } catch (e) {
    handleControllerError(res, e, 'Send interest');
  }
};

// Accept interest
export const acceptInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid interest ID' });
    }

    const interest = await Interest.findById(id);
    if (!interest) return res.status(404).json({ message: 'Interest not found' });

    if (interest.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to accept this interest' });
    }

    if (interest.status !== 'pending') {
      return res.status(400).json({ message: `Interest already ${interest.status}`, status: interest.status });
    }

    interest.status = 'accepted';
    interest.respondedAt = new Date();
    await interest.save();

    // ✅ Notification to sender (best effort)
    try {
      const receiverProfile = await Profile.findOne({ userId: interest.receiverId }).select('_id fullName').lean();
      await Notification.create({
        userId: interest.senderId,
        type: 'interest_accepted',
        title: 'Interest accepted',
        message: `${receiverProfile?.fullName || 'Someone'} accepted your interest.`,
        relatedUserId: interest.receiverId,
        relatedProfileId: receiverProfile?._id,
        relatedInterestId: interest._id,
        actionUrl: '/interests',
        metadata: { status: 'accepted' },
      });
    } catch {
      // ignore
    }

    res.json({ message: 'Interest accepted', interest });
  } catch (e) {
    handleControllerError(res, e, 'Accept interest');
  }
};

// Decline interest
export const declineInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid interest ID' });
    }

    const interest = await Interest.findById(id);
    if (!interest) return res.status(404).json({ message: 'Interest not found' });

    if (interest.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to decline this interest' });
    }

    if (interest.status !== 'pending') {
      return res.status(400).json({ message: `Interest already ${interest.status}`, status: interest.status });
    }

    interest.status = 'declined';
    interest.declineReason = reason?.trim();
    interest.respondedAt = new Date();
    await interest.save();

    // ✅ Notification to sender (best effort)
    try {
      const receiverProfile = await Profile.findOne({ userId: interest.receiverId }).select('_id fullName').lean();
      await Notification.create({
        userId: interest.senderId,
        type: 'interest_declined',
        title: 'Interest declined',
        message: `${receiverProfile?.fullName || 'Someone'} declined your interest.`,
        relatedUserId: interest.receiverId,
        relatedProfileId: receiverProfile?._id,
        relatedInterestId: interest._id,
        actionUrl: '/interests',
        metadata: { status: 'declined' },
      });
    } catch {
      // ignore
    }

    res.json({ message: 'Interest declined', interest });
  } catch (e) {
    handleControllerError(res, e, 'Decline interest');
  }
};

// Block interest
export const blockInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid interest ID' });

    const interest = await Interest.findById(id);
    if (!interest) return res.status(404).json({ message: 'Interest not found' });

    if (interest.receiverId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to block this interest' });
    }

    interest.status = 'blocked';
    interest.respondedAt = new Date();
    await interest.save();

    res.json({ message: 'User blocked', interest });
  } catch (e) {
    handleControllerError(res, e, 'Block interest');
  }
};

// Withdraw interest
export const withdrawInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid interest ID' });

    const interest = await Interest.findById(id);
    if (!interest) return res.status(404).json({ message: 'Interest not found' });

    if (interest.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to withdraw this interest' });
    }

    if (interest.status !== 'pending') {
      return res.status(400).json({ message: `Cannot withdraw - interest already ${interest.status}` });
    }

    interest.status = 'withdrawn';
    await interest.save();

    res.json({ message: 'Interest withdrawn' });
  } catch (e) {
    handleControllerError(res, e, 'Withdraw interest');
  }
};

// Get interests sent
export const getInterestsSent = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const query = { senderId: userId };
    if (status && status !== 'all') query.status = status;

    const [interests, total] = await Promise.all([
      Interest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'receiverProfileId', select: 'fullName photos profileId age city occupation' })
        .lean(),
      Interest.countDocuments(query),
    ]);

    const formatted = interests.map((interest) => ({ ...interest, receiverProfile: interest.receiverProfileId }));

    res.json({ interests: formatted, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get sent interests');
  }
};

// Get interests received
export const getInterestsReceived = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const query = { receiverId: userId };
    if (status && status !== 'all') query.status = status;

    const [interests, total] = await Promise.all([
      Interest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'senderProfileId', select: 'fullName photos profileId age city occupation' })
        .lean(),
      Interest.countDocuments(query),
    ]);

    const formatted = interests.map((interest) => ({ ...interest, senderProfile: interest.senderProfileId }));

    res.json({ interests: formatted, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get received interests');
  }
};

// Get accepted interests
export const getAcceptedInterests = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);

    const query = {
      $or: [
        { senderId: userId, status: 'accepted' },
        { receiverId: userId, status: 'accepted' },
      ],
    };

    const [interests, total] = await Promise.all([
      Interest.find(query)
        .sort({ respondedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderProfileId', 'fullName photos profileId age city')
        .populate('receiverProfileId', 'fullName photos profileId age city')
        .lean(),
      Interest.countDocuments(query),
    ]);

    res.json({ interests, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get accepted interests');
  }
};

// Get declined interests
export const getDeclinedInterests = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);

    const query = { receiverId: userId, status: 'declined' };

    const [interests, total] = await Promise.all([
      Interest.find(query)
        .sort({ respondedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderProfileId', 'fullName photos profileId')
        .lean(),
      Interest.countDocuments(query),
    ]);

    res.json({ interests, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get declined interests');
  }
};

// Get mutual interests
export const getMutualInterests = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);

    const sentInterests = await Interest.find({ senderId: userId, status: 'accepted' }).select('receiverId').lean();
    const receiverIds = sentInterests.map((i) => i.receiverId);

    const mutualQuery = { senderId: { $in: receiverIds }, receiverId: userId, status: 'accepted' };

    const [interests, total] = await Promise.all([
      Interest.find(mutualQuery)
        .sort({ respondedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderProfileId', 'fullName photos profileId age city')
        .lean(),
      Interest.countDocuments(mutualQuery),
    ]);

    res.json({ interests, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get mutual interests');
  }
};

// Get interest status between users
export const getInterestStatus = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const [sent, received] = await Promise.all([
      Interest.findOne({ senderId: currentUserId, receiverId: targetUserId }).lean(),
      Interest.findOne({ senderId: targetUserId, receiverId: currentUserId }).lean(),
    ]);

    res.json({
      sent: sent ? { id: sent._id, status: sent.status } : null,
      received: received ? { id: received._id, status: received.status } : null,
      isMatch: sent?.status === 'accepted' && received?.status === 'accepted',
    });
  } catch (e) {
    handleControllerError(res, e, 'Get interest status');
  }
};

// ===== SHORTLIST =====

export const getShortlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, skip } = parsePagination(req.query);

    const [shortlist, total] = await Promise.all([
      Shortlist.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'shortlistedProfileId', select: 'fullName photos profileId age city occupation' })
        .lean(),
      Shortlist.countDocuments({ userId }),
    ]);

    res.json({ shortlist, pagination: formatPaginationResponse(total, page, limit) });
  } catch (e) {
    handleControllerError(res, e, 'Get shortlist');
  }
};

export const addToShortlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    const { note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });
    if (userId.toString() === targetUserId) return res.status(400).json({ message: 'Cannot shortlist yourself' });

    const targetExists = await User.exists({ _id: targetUserId });
    if (!targetExists) return res.status(404).json({ message: 'User not found' });

    const existing = await Shortlist.findOne({ userId, shortlistedUserId: targetUserId }).lean();
    if (existing) return res.status(400).json({ message: 'Already shortlisted' });

    const profile = await Profile.findOne({ userId: targetUserId }).select('_id').lean();

    const shortlist = await Shortlist.create({
      userId,
      shortlistedUserId: targetUserId,
      shortlistedProfileId: profile?._id,
      note: note?.trim(),
    });

    res.status(201).json({ message: 'Added to shortlist', shortlist });
  } catch (e) {
    handleControllerError(res, e, 'Add to shortlist');
  }
};

export const removeFromShortlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

    const result = await Shortlist.findOneAndDelete({ userId, shortlistedUserId: targetUserId }).lean();
    if (!result) return res.status(404).json({ message: 'Not in shortlist' });

    res.json({ message: 'Removed from shortlist' });
  } catch (e) {
    handleControllerError(res, e, 'Remove from shortlist');
  }
};

export const isShortlisted = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

    const exists = await Shortlist.exists({ userId, shortlistedUserId: targetUserId });
    res.json({ isShortlisted: !!exists });
  } catch (e) {
    handleControllerError(res, e, 'Check shortlist');
  }
};

export const updateShortlistNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userId: targetUserId } = req.params;
    const { note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

    const shortlist = await Shortlist.findOneAndUpdate(
      { userId, shortlistedUserId: targetUserId },
      { note: note?.trim() },
      { new: true }
    ).lean();

    if (!shortlist) return res.status(404).json({ message: 'Not in shortlist' });

    res.json({ message: 'Note updated', shortlist });
  } catch (e) {
    handleControllerError(res, e, 'Update shortlist note');
  }
};