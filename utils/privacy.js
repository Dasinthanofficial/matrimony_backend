// ===== FILE: ./utils/privacy.js =====
import { hasPremiumAccess } from './entitlements.js';

const canSeePhotosByVisibility = ({ photoVisibility, isOwn, isPremium, isMatch }) => {
  if (isOwn) return true;

  const v = photoVisibility || 'all';
  if (v === 'all') return true;
  if (v === 'none') return false;
  if (v === 'premium') return isPremium;
  if (v === 'connected' || v === 'matches') return isMatch;
  return false;
};

const canSeeProfileByVisibility = ({ profileVisibility, isOwn, isPremium, isMatch, isRegistered }) => {
  if (isOwn) return true;

  const v = profileVisibility || 'all';
  if (v === 'all') return true;
  if (v === 'none') return false;
  if (v === 'registered') return isRegistered;
  if (v === 'premium') return isPremium;
  if (v === 'matches') return isMatch;
  return false;
};

export const applyProfilePrivacy = ({ viewer, profile, isMatch = false }) => {
  const result = { ...profile };

  const viewerId = viewer?._id?.toString?.();
  const ownerId = profile.userId?._id?.toString?.() || profile.userId?.toString?.();
  const isOwn = !!(viewerId && ownerId && viewerId === ownerId);

  const isPremium = hasPremiumAccess(viewer);
  const isRegistered = !!viewer;
  const ps = profile.privacySettings || {};

  const canSeeProfile = canSeeProfileByVisibility({
    profileVisibility: ps.profileVisibility,
    isOwn,
    isPremium,
    isMatch,
    isRegistered,
  });

  if (!canSeeProfile) {
    return {
      _id: profile._id,
      userId: profile.userId,
      profileId: profile.profileId,
      profileLocked: true,
      viewerContext: { isOwn, isPremiumViewer: isPremium, isMatch, isRegistered },
    };
  }

  // Contact info flags
  const canSeePhone = isOwn || ps.showPhone === true;
  const canSeeEmail = isOwn || ps.showEmail === true;
  const canSeeIncome = isOwn || ps.showIncome === true;

  // user contact (if populated)
  if (result.userId && typeof result.userId === 'object') {
    if (!canSeePhone) {
      delete result.userId.phone;
      delete result.userId.countryCode;
    }
    if (!canSeeEmail) {
      delete result.userId.email;
    }
  }

  // ALSO protect top-level email if callers attach it (search used to do this)
  if (!canSeeEmail) {
    delete result.email;
  }

  // profile income
  if (!canSeeIncome) {
    delete result.annualIncome;
  }

  // Photos
  const canSeePhotos = canSeePhotosByVisibility({
    photoVisibility: ps.photoVisibility,
    isOwn,
    isPremium,
    isMatch,
  });

  if (!canSeePhotos) {
    result.photos = [];
    result.photosLocked = true;
  }

  result.viewerContext = { isOwn, isPremiumViewer: isPremium, isMatch, isRegistered };
  return result;
};