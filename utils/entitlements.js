// ===== FILE: ./utils/entitlements.js =====
export const hasPremiumAccess = (user) => {
  if (!user) return false;

  const endDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : null;

  const subActive =
    user.subscription?.isActive === true &&
    endDate instanceof Date &&
    !Number.isNaN(endDate.valueOf()) &&
    new Date() < endDate;

  // Only treat subscription snapshot as source-of-truth if it represents paid access
  const hasPaidSnapshot =
    user.subscription?.plan === 'monthly' ||
    user.subscription?.plan === 'yearly' ||
    !!user.subscription?.endDate;

  if (hasPaidSnapshot) return subActive;

  if (user.premiumExpiry && new Date() < new Date(user.premiumExpiry)) return true;

  return Boolean(user.isPremium);
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