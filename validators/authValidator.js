import { body } from 'express-validator';

export const registerValidator = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').exists().withMessage('Password required'),
];