const express = require('express');
const { query, param, validationResult } = require('express-validator');
const ontongService = require('../services/ontongService');
// 로그인 미들웨어 제거 - 온통청년 API만 사용

const router = express.Router();

// Helper function to format policy data for frontend compatibility
function formatPolicyForFrontend(policy) {
  return {
    ...policy,
    title: policy.title,
    category: policy.category,
    description: policy.description,
    startDate: policy.start_date ? policy.start_date.toISOString() : null,
    endDate: policy.end_date ? policy.end_date.toISOString() : null,
    deadline: policy.deadline ? policy.deadline.toISOString() : null,
    applicationUrl: policy.application_url,
    saves: policy.bookmark_count || policy.application_count || 0,
    requirements: policy.requirements || []
  };
}

/**
 * 정책 목록 조회 (온통청년 API)
 * GET /api/policies
 */
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('category')
    .optional()
    .isIn(['장학금', '창업지원', '취업지원', '주거지원', '생활복지', '문화', '참여권리'])
    .withMessage('Invalid category'),
  query('region')
    .optional()
    .isString()
    .trim()
    .withMessage('Region must be a string'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  query('ageMin')
    .optional()
    .isInt({ min: 18, max: 65 })
    .withMessage('Age min must be between 18 and 65'),
  query('ageMax')
    .optional()
    .isInt({ min: 18, max: 65 })
    .withMessage('Age max must be between 18 and 65')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      category,
      region,
      search,
      ageMin,
      ageMax
    } = req.query;

    // 온통청년 API에서 정책 조회
    const result = await ontongService.getPolicies({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      region,
      searchText: search,
      ageMin: ageMin ? parseInt(ageMin) : undefined,
      ageMax: ageMax ? parseInt(ageMax) : undefined
    });

    res.json({
      success: true,
      message: 'Policies retrieved successfully',
      data: result
    });

  } catch (error) {
    console.error('Get policies error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve policies'
    });
  }
});

/**
 * 정책 상세 조회 (온통청년 API)
 * GET /api/policies/:id
 */
router.get('/:id', [
  param('id')
    .notEmpty()
    .withMessage('Policy ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid policy ID',
        details: errors.array()
      });
    }

    const { id } = req.params;

    // 온통청년 API에서 정책 상세 정보 조회
    const policy = await ontongService.getPolicyDetail(id);

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found'
      });
    }

    res.json({
      success: true,
      message: 'Policy details retrieved successfully',
      data: policy
    });

  } catch (error) {
    console.error('Get policy detail error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve policy details'
    });
  }
});

module.exports = router;