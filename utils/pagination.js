// ===== FILE: ./utils/pagination.js =====

import { LIMITS } from './constants.js';

/**
 * Parse pagination parameters from query string
 * @param {Object} query - Express req.query object
 * @param {Object} options - Custom options
 * @returns {Object} Parsed pagination values
 */
export const parsePagination = (query, options = {}) => {
  const {
    maxLimit = LIMITS.MAX_LIMIT,
    defaultLimit = LIMITS.DEFAULT_LIMIT,
    defaultPage = LIMITS.DEFAULT_PAGE,
  } = options;

  const page = Math.max(1, parseInt(query.page, 10) || defaultPage);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(query.limit, 10) || defaultLimit)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Format pagination response
 * @param {number} total - Total count of documents
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Formatted pagination object
 */
export const formatPaginationResponse = (total, page, limit) => {
  const pages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
};

/**
 * Combined helper for pagination
 * @param {Object} query - Express req.query
 * @param {number} total - Total document count
 * @param {Object} options - Custom options
 * @returns {Object} { page, limit, skip, pagination }
 */
export const getPagination = (query, total, options = {}) => {
  const { page, limit, skip } = parsePagination(query, options);
  const pagination = formatPaginationResponse(total, page, limit);

  return { page, limit, skip, pagination };
};

export default {
  parsePagination,
  formatPaginationResponse,
  getPagination,
};