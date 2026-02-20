// ===== FILE: ./controllers/dashboardController.js =====
import Profile from '../models/Profile.js';
import Interest from '../models/Interest.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js'; // Ensure this model exists
import { handleControllerError } from '../utils/errors.js';

export const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Fetch User Profile
    const profile = await Profile.findOne({ userId }).lean();

    // 2. Fetch Subscription Status
    const user = await User.findById(userId).select('isPremium subscription premiumExpiry').lean();
    
    let daysRemaining = 0;
    if (user.isPremium && user.premiumExpiry) {
      const now = new Date();
      const expiry = new Date(user.premiumExpiry);
      if (expiry > now) {
        daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      }
    }

    const subscriptionData = {
      isPremium: !!user.isPremium,
      plan: user.subscription?.plan || 'Free',
      daysRemaining
    };

    // 3. Fetch Key Stats
    const [pendingInterests, matches, shortlists] = await Promise.all([
      Interest.countDocuments({ receiverId: userId, status: 'pending' }),
      Interest.countDocuments({ 
        $or: [
          { senderId: userId, status: 'accepted' },
          { receiverId: userId, status: 'accepted' }
        ]
      }),
      // Assuming you have a way to count shortlists, otherwise 0
      // If Shortlist is a model: Shortlist.countDocuments({ userId })
      // If it's an array in User/Profile, we might not count it here easily without fetching. 
      // For now, return 0 or implement specific logic if Shortlist model exists.
      0 
    ]);

    res.json({
      success: true,
      profile: {
        fullName: profile?.fullName || user.email,
        photoUrl: profile?.photos?.find(p => p.isProfile)?.url || profile?.photos?.[0]?.url || null,
        completionPercentage: profile?.completionPercentage || 0,
        profileViews: profile?.profileViews || 0
      },
      stats: {
        pendingInterests,
        matches,
        shortlists
      },
      subscription: subscriptionData
    });

  } catch (error) {
    handleControllerError(res, error, 'Dashboard Summary');
  }
};

export const getRecentVisitors = async (req, res) => {
  try {
    const userId = req.user._id;
    // Basic implementation: fetch notifications of type 'profile_view'
    // In a real app, you might have a dedicated 'Visitor' model
    const visits = await Notification.find({ 
      userId, 
      type: 'profile_view' 
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('relatedUserId', 'fullName') // Assuming User model has fullName, else use Profile lookups
    .lean();

    // Since User model usually doesn't have photos, we might need to fetch profiles manually
    // But for a quick widget, just names might suffice or we enhance this later.
    
    res.json({
      success: true,
      visitors: visits
    });
  } catch (error) {
    handleControllerError(res, error, 'Dashboard Visitors');
  }
};