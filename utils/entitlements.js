// ===== FIXED FILE: ./utils/entitlements.js =====
export const hasPremiumAccess = (user) => {
  if (!user) return false;

  const endDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : null;

  const subActive =
    user.subscription?.isActive === true &&
    endDate instanceof Date &&
    !Number.isNaN(endDate.valueOf()) &&
    new Date() < endDate;

  const hasPaidSnapshot =
    user.subscription?.plan === 'monthly' ||
    user.subscription?.plan === 'yearly' ||
    !!user.subscription?.endDate;

  if (hasPaidSnapshot) return subActive;

  // ✅ FIX: Only trust premiumExpiry if it exists AND is in the future
  if (user.premiumExpiry && new Date() < new Date(user.premiumExpiry)) return true;

  // ✅ FIX: Only trust isPremium if premiumExpiry exists and is valid
  // Bare isPremium without expiry should NOT grant access (prevents stale flag)
  if (user.isPremium && user.premiumExpiry) {
    return new Date() < new Date(user.premiumExpiry);
  }

  return false;
};

export const isSubscriptionExpired = (user) => {
  if (!user?.subscription?.endDate) return true;
  return new Date() >= new Date(user.subscription.endDate);
};

export const getSubscriptionDaysRemaining = (user) => {
  if (!user?.subscription?.endDate) return 0;
  const end = new Date(user.subscription.endDate);
  const now = new Date();
  if (now >= end) return 0;
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
};