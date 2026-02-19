import User from '../models/User.js';

export const requireAgency = async (req, res, next) => {
  try {
    // Works with most auth middlewares
    const id =
      req.user?.id ||
      req.user?._id ||
      req.userId ||
      req.auth?.id ||
      null;

    // If your auth middleware already attaches role, use it
    const role = req.user?.role || req.auth?.role;

    if (role) {
      if (role !== 'agency') return res.status(403).json({ message: 'Agency access only' });
      return next();
    }

    // Otherwise fetch user to check role
    if (!id) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(id).select('role').lean();
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    if (user.role !== 'agency') {
      return res.status(403).json({ message: 'Agency access only' });
    }

    return next();
  } catch (e) {
    return res.status(500).json({ message: 'Agency role check failed' });
  }
};