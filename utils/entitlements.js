export const hasPremiumAccess = (user) => {
  if (!user) return false;

  const plan = String(user.subscription?.plan || 'free');
  const isActiveFlag = user.subscription?.isActive === true;

  if (isActiveFlag) {
    const endDateRaw = user.subscription?.endDate;
    if (!endDateRaw) return plan !== 'free';
    const endDate = new Date(endDateRaw);
    if (!Number.isNaN(endDate.valueOf())) return new Date() < endDate;
  }

  if (user.premiumExpiry) {
    const exp = new Date(user.premiumExpiry);
    if (!Number.isNaN(exp.valueOf()) && new Date() < exp) return true;
  }

  if (user.isPremium && user.premiumExpiry) {
    const exp = new Date(user.premiumExpiry);
    return !Number.isNaN(exp.valueOf()) && new Date() < exp;
  }

  return false;
};

// ✅ NEW: chat access rule (agencies can chat even without premium)
export const canChatAccess = (user) => {
  if (!user) return false;
  if (user.role === 'agency') return true;
  return hasPremiumAccess(user);
};

export const isSubscriptionExpired = (user) => {
  if (user?.subscription?.isActive === true && !user?.subscription?.endDate) return false;
  if (!user?.subscription?.endDate) return true;
  return new Date() >= new Date(user.subscription.endDate);
};

export const getSubscriptionDaysRemaining = (user) => {
  if (user?.subscription?.isActive === true && !user?.subscription?.endDate) return Infinity;

  if (!user?.subscription?.endDate) return 0;
  const end = new Date(user.subscription.endDate);
  const now = new Date();
  if (now >= end) return 0;
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
};