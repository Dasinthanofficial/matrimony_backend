// ===== FILE: ./utils/errors.js =====

export class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Standardized error handler for controllers
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {string} context - Context for logging (e.g., 'Search profiles')
 */
export const handleControllerError = (res, error, context = 'Operation') => {
  // Log error with context
  console.error(`${context} error:`, {
    message: error.message,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    code: error.code,
  });

  // Handle known operational errors
  if (error.isOperational) {
    return res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      ...(error.errors && { errors: error.errors }),
    });
  }

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors,
    });
  }

  // Handle Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      message: `Duplicate value for ${field}`,
      code: 'DUPLICATE_KEY',
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: `Invalid ${error.path}: ${error.value}`,
      code: 'INVALID_ID',
    });
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Generic server error - don't expose details in production
  return res.status(500).json({
    message: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { debug: error.message }),
  });
};

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  handleControllerError,
};