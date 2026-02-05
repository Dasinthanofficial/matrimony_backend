// ===== FILE: ./validators/searchValidator.js =====
import { query } from 'express-validator';
import { LIMITS, GENDERS, MARITAL_STATUSES, DIET_OPTIONS } from '../utils/constants.js';

const GENDERS_WITH_ALL = [...GENDERS, 'all'];

export const searchProfilesValidator = [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: LIMITS.MAX_LIMIT_SEARCH })
    .toInt()
    .withMessage(`Limit must be between 1 and ${LIMITS.MAX_LIMIT_SEARCH}`),

  query('minAge').optional().isInt({ min: 18, max: 100 }).toInt().withMessage('minAge must be between 18 and 100'),

  query('maxAge').optional().isInt({ min: 18, max: 100 }).toInt().withMessage('maxAge must be between 18 and 100'),

  query('gender')
    .optional()
    .isIn(GENDERS_WITH_ALL)
    .withMessage(`Gender must be one of: ${GENDERS_WITH_ALL.join(', ')}`),

  query('maritalStatus').optional().isIn(MARITAL_STATUSES).withMessage('Invalid marital status'),

  query('diet').optional().isIn(DIET_OPTIONS).withMessage('Invalid diet option'),

  query('religion').optional().trim().isLength({ max: 50 }).withMessage('Religion must be less than 50 characters'),

  query('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),

  query('state').optional().trim().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),

  query('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'age', 'completionPercentage', 'lastActive'])
    .withMessage('Invalid sort field'),

  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

export const quickSearchValidator = [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: LIMITS.MAX_LIMIT_SEARCH })
    .toInt()
    .withMessage(`Limit must be between 1 and ${LIMITS.MAX_LIMIT_SEARCH}`),

  query('gender').optional().isIn(GENDERS_WITH_ALL).withMessage('Invalid gender'),

  query('minAge').optional().isInt({ min: 18, max: 100 }).toInt().withMessage('minAge must be between 18 and 100'),

  query('maxAge').optional().isInt({ min: 18, max: 100 }).toInt().withMessage('maxAge must be between 18 and 100'),

  query('religion').optional().trim().isLength({ max: 50 }).withMessage('Religion must be less than 50 characters'),

  query('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
];

export const suggestedProfilesValidator = [
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt().withMessage('Limit must be between 1 and 50'),
];