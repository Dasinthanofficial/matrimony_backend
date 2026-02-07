// ===== UPDATED FILE: ./validators/commonValidator.js =====
import { body, query, param } from 'express-validator';

// Create profile (required fields)
export const createProfileValidator = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('gender').isIn(['male','female']).withMessage('Invalid gender'),
  body('dateOfBirth').isISO8601().withMessage('Valid date required'),
  body('religion').trim().notEmpty().withMessage('Religion required'),
  body('country').trim().notEmpty().withMessage('Country required'),
  body('city').trim().notEmpty().withMessage('City required'),
  body('maritalStatus')
    .isIn(['never_married','divorced','widowed','awaiting_divorce','annulled'])
    .withMessage('Invalid marital status'),
];

// Update profile (all optional, but validated if present)
export const updateProfileValidator = [
  body('fullName')
    .optional()
    .trim()
    .notEmpty().withMessage('Full name required')
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('gender')
    .optional()
    .isIn(['male','female']).withMessage('Invalid gender'),
  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Valid date required'),
  body('religion')
    .optional()
    .trim()
    .notEmpty().withMessage('Religion required'),
  body('country')
    .optional()
    .trim()
    .notEmpty().withMessage('Country required'),
  body('city')
    .optional()
    .trim()
    .notEmpty().withMessage('City required'),
  body('maritalStatus')
    .optional()
    .isIn(['never_married','divorced','widowed','awaiting_divorce','annulled'])
    .withMessage('Invalid marital status'),
];

// Backwards compatibility (if anything else imports profileValidator)
export const profileValidator = createProfileValidator;

export const searchValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100'),
  query('minAge').optional().isInt({ min: 18, max: 100 }).withMessage('minAge must be 18–100'),
  query('maxAge').optional().isInt({ min: 18, max: 100 }).withMessage('maxAge must be 18–100'),
  query('religion').optional().trim().isLength({ max: 50 }).withMessage('Invalid religion'),
];

// Match Interest schema max length (200)
export const interestValidator = [
  body('receiverId')
    .notEmpty().withMessage('Receiver ID required')
    .isMongoId().withMessage('Invalid receiver ID'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Message too long (max 200 characters)'),
];

export const reportValidator = [
  body('reportedUserId')
    .notEmpty().withMessage('User ID required')
    .isMongoId().withMessage('Invalid user ID'),
  body('reportType')
    .isIn([
      'fake_profile','inappropriate_behavior','harassment',
      'inappropriate_content','scam','offensive_language','other'
    ])
    .withMessage('Invalid report type'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description required')
    .isLength({ max: 500 }).withMessage('Description too long'),
  body('evidence')
    .optional()
    .isArray({ max: 10 }).withMessage('Evidence must be an array of up to 10 items'),
  body('evidence.*')
    .optional()
    .isString().withMessage('Evidence items must be strings')
    .trim()
    .notEmpty().withMessage('Evidence items must be non-empty strings'),
];

export const mongoIdValidator = [
  param('id').isMongoId().withMessage('Invalid ID format'),
];

// validate routes like /api/interests/:userId
export const userIdParamValidator = [
  param('userId').isMongoId().withMessage('Invalid user ID'),
];