import { body, query, param } from 'express-validator';

export const profileValidator = [
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

export const searchValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1–100'),
  query('minAge').optional().isInt({ min: 18, max: 100 }).withMessage('minAge must be 18–100'),
  query('maxAge').optional().isInt({ min: 18, max: 100 }).withMessage('maxAge must be 18–100'),
  query('religion').optional().trim().isLength({ max: 50 }).withMessage('Invalid religion'),
];

// Match Interest schema max length (200)
export const interestValidator = [
  body('receiverId').notEmpty().withMessage('Receiver ID required').isMongoId().withMessage('Invalid receiver ID'),
  body('message').optional().trim().isLength({ max: 200 }).withMessage('Message too long (max 200 characters)'),
];

export const reportValidator = [
  body('reportedUserId').notEmpty().withMessage('User ID required').isMongoId().withMessage('Invalid user ID'),
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
];

export const mongoIdValidator = [
  param('id').isMongoId().withMessage('Invalid ID format'),
];

// validate routes like /api/interests/:userId
export const userIdParamValidator = [
  param('userId').isMongoId().withMessage('Invalid user ID'),
];