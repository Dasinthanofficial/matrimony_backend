export const LIMITS = {
  MAX_MESSAGE_LENGTH: 2000,
  MAX_INTEREST_MESSAGE: 200,
  MAX_BIO_LENGTH: 1000,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_RESOLUTION_NOTE: 1000,
  MAX_NAME_LENGTH: 100,
  MAX_REASON_LENGTH: 500,

  MAX_PHOTOS: 6, // aligned with UI + upload middleware
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB

  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 200,
  MAX_LIMIT_SEARCH: 100,
};

export const OTP = {
  EXPIRY_MINUTES: 10,
  LENGTH: 6,
};

export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: '7d',
  EMAIL_VERIFICATION: 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  PHONE_OTP: 10 * 60 * 1000,
};

export const CLEANUP_INTERVAL = 60000;

export const REPORT_TYPES = [
  'fake_profile',
  'inappropriate_behavior',
  'harassment',
  'inappropriate_content',
  'scam',
  'offensive_language',
  'other',
];

export const REPORT_ACTIONS = ['none', 'warning', 'suspension', 'deletion'];

export const SUBSCRIPTION_PLANS = ['free', 'monthly', 'yearly'];

export const MARITAL_STATUSES = [
  'never_married',
  'divorced',
  'widowed',
  'awaiting_divorce',
  'annulled',
];

export const GENDERS = ['male', 'female'];

export const DIET_OPTIONS = [
  'vegetarian',
  'non_vegetarian',
  'eggetarian',
  'vegan',
  'jain',
  'pescatarian',
];

export const BODY_TYPES = ['slim', 'average', 'athletic', 'heavy', 'fit'];