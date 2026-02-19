// server/middleware/requireAgencyApproved.js
export function requireAgencyApproved(req, res, next) {
  const status = req.user?.agencyVerification?.status;

  if (status !== 'approved') {
    return res.status(403).json({
      message: 'Agency not approved',
      code: 'AGENCY_NOT_APPROVED',
      status: status || 'none',
    });
  }

  return next();
}