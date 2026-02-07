// ===== FIXED FILE: ./middleware/errorHandler.js =====
const errorHandler = (err, req, res, next) => {
  // ✅ FIX: If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  console.error('ERROR:', err);
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export default errorHandler;