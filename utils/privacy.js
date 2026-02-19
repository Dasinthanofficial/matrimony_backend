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
  const ownerId =
    profile.userId?._id?.toString?.() ||
    profile.userId?.toString?.() ||
    null;

  const isOwn = !!(viewerId && ownerId && viewerId === ownerId);

  const isPremium = hasPremiumAccess(viewer);
  const isRegistered = !!viewer;
  const ps = profile.privacySettings || {};

  // ✅ Agency-managed profiles are never locked
  const isAgencyManaged = !!profile.isAgencyManaged;

  const canSeeProfile = isAgencyManaged
    ? true
    : canSeeProfileByVisibility({
        profileVisibility: ps.profileVisibility,
        isOwn,
        isPremium,
        isMatch,
        isRegistered,
      });

  if (!canSeeProfile) {
    return {
      _id: profile._id,
      userId: ownerId, // ✅ never return populated user object here
      profileId: profile.profileId,
      profileLocked: true,
      photosLocked: true,
      viewerContext: { isOwn, isPremiumViewer: isPremium, isMatch, isRegistered },
    };
  }

  const canSeePhone = isOwn || ps.showPhone === true;
  const canSeeEmail = isOwn || ps.showEmail === true;
  const canSeeIncome = isOwn || ps.showIncome === true;

  if (result.userId && typeof result.userId === 'object') {
    if (!canSeePhone) {
      delete result.userId.phone;
      delete result.userId.countryCode;
    }
    if (!canSeeEmail) {
      delete result.userId.email;
    }
  }

  if (!canSeeEmail) delete result.email;
 if (!canSeeIncome) {
  delete result.annualIncome;
  delete result.monthlyIncome; 
}

  const canSeePhotos = isAgencyManaged
    ? true
    : canSeePhotosByVisibility({
        photoVisibility: ps.photoVisibility,
        isOwn,
        isPremium,
        isMatch,
      });

  if (!canSeePhotos) {
    result.photos = [];
    result.photosLocked = true;
    if ('photoUrl' in result) result.photoUrl = null;
  }

  result.viewerContext = { isOwn, isPremiumViewer: isPremium, isMatch, isRegistered };
  return result;
};