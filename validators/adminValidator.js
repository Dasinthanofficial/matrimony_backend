import { body, param, query } from 'express-validator';

export const suspendUserValidator = [
  param('userId').isMongoId().withMessage('Invalid user ID'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason too long (max 500 characters)'),
];

export const resolveReportValidator = [
  param('reportId').isMongoId().withMessage('Invalid report ID'),
  body('action')
    .isIn(['none', 'warning', 'suspension', 'deletion'])
    .withMessage('Invalid action. Must be: none, warning, suspension, or deletion'),
  body('resolutionNote')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Resolution note too long (max 1000 characters)'),
];

export const paginationValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200'),
];