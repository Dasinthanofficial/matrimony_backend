// ===== FILE: ./controllers/reportController.js =====

import mongoose from 'mongoose';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { handleControllerError } from '../utils/errors.js';
import { parsePagination, formatPaginationResponse } from '../utils/pagination.js';
import { LIMITS, REPORT_TYPES } from '../utils/constants.js';

export const createReport = async (req, res) => {
  try {
    const { reportedUserId, reportType, description, evidence = [] } = req.body;

    // Validate required fields
    if (!reportedUserId) {
      return res.status(400).json({ message: 'Reported user ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(reportedUserId)) {
      return res.status(400).json({ message: 'Invalid reported user ID' });
    }

    if (!reportType) {
      return res.status(400).json({ message: 'Report type is required' });
    }

    if (!REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({
        message: `Invalid report type. Must be one of: ${REPORT_TYPES.join(', ')}`,
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }

    if (description.length > LIMITS.MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description too long (max ${LIMITS.MAX_DESCRIPTION_LENGTH} characters)`,
      });
    }

    // Cannot report yourself
    if (reportedUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot report yourself' });
    }

    // Check if reported user exists
    const reportedUser = await User.exists({ _id: reportedUserId });
    if (!reportedUser) {
      return res.status(404).json({ message: 'Reported user not found' });
    }

    // Check for existing pending/under_review report
    const existing = await Report.findOne({
      reportedUserId,
      reportedByUserId: req.user._id,
      status: { $in: ['pending', 'under_review'] },
    });

    if (existing) {
      return res.status(400).json({
        message: 'You have already reported this user. Please wait for the existing report to be reviewed.',
        existingReportId: existing._id,
      });
    }

    // Validate evidence array
    const validEvidence = Array.isArray(evidence)
      ? evidence.filter((e) => typeof e === 'string' && e.trim()).slice(0, 10)
      : [];

    const report = await Report.create({
      reportedUserId,
      reportedByUserId: req.user._id,
      reportType,
      description: description.trim(),
      evidence: validEvidence,
    });

    res.status(201).json({
      message: 'Report submitted successfully. Our team will review it shortly.',
      report: {
        _id: report._id,
        reportType: report.reportType,
        status: report.status,
        createdAt: report.createdAt,
      },
    });
  } catch (e) {
    handleControllerError(res, e, 'Create report');
  }
};

export const getMyReports = async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { reportedByUserId: req.user._id };

    // Validate status filter
    const validStatuses = ['all', 'pending', 'under_review', 'resolved', 'rejected', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    if (status !== 'all') {
      filter.status = status;
    }

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reportedUserId', 'email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-evidence') // Don't include evidence in list view
        .lean(),
      Report.countDocuments(filter),
    ]);

    res.json({
      reports,
      pagination: formatPaginationResponse(total, page, limit),
    });
  } catch (e) {
    handleControllerError(res, e, 'Get my reports');
  }
};

export const getReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: 'Invalid report ID' });
    }

    const report = await Report.findById(reportId)
      .populate('reportedUserId', 'email')
      .lean();

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Only allow the reporter to view their own report details
    if (report.reportedByUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this report' });
    }

    // Return report with appropriate fields based on status
    const response = {
      _id: report._id,
      reportType: report.reportType,
      description: report.description,
      status: report.status,
      createdAt: report.createdAt,
      reportedUser: report.reportedUserId,
    };

    // Include resolution info if resolved
    if (report.status === 'resolved' || report.status === 'rejected') {
      response.resolvedAt = report.resolvedAt;
      response.resolutionNote = report.resolutionNote;
      response.action = report.action;
    }

    res.json(response);
  } catch (e) {
    handleControllerError(res, e, 'Get report status');
  }
};

// Get report statistics for user (how many reports they've made)
export const getMyReportStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Report.aggregate([
      { $match: { reportedByUserId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const formattedStats = {
      total: 0,
      pending: 0,
      under_review: 0,
      resolved: 0,
      rejected: 0,
      dismissed: 0,
    };

    stats.forEach((stat) => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
    });

    res.json({ stats: formattedStats });
  } catch (e) {
    handleControllerError(res, e, 'Get report stats');
  }
};