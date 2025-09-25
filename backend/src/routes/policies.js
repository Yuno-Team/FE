const express = require('express');
const { query, body, param, validationResult } = require('express-validator');
const ontongService = require('../services/ontongService');
const { optionalAuth, authenticateToken, logRequest } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// 모든 정책 라우트에 로깅 적용
router.use(logRequest);

/**
 * 정책 목록 조회
 * GET /api/policies
 */
router.get('/', [
  optionalAuth,
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

    // 온통청년 API 또는 캐시에서 정책 조회
    const result = await ontongService.getPolicies({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      region,
      searchText: search,
      ageMin: ageMin ? parseInt(ageMin) : undefined,
      ageMax: ageMax ? parseInt(ageMax) : undefined
    });

    // 로그인한 사용자의 경우 북마크 정보 추가
    if (req.user && result.policies.length > 0) {
      const policyIds = result.policies.map(p => p.id);
      const bookmarks = await db.query(
        'SELECT policy_id FROM bookmarks WHERE user_id = $1 AND policy_id = ANY($2)',
        [req.user.id, policyIds]
      );

      const bookmarkedIds = new Set(bookmarks.rows.map(b => b.policy_id));

      result.policies = result.policies.map(policy => ({
        ...policy,
        isBookmarked: bookmarkedIds.has(policy.id)
      }));
    }

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
 * 정책 상세 조회
 * GET /api/policies/:id
 */
router.get('/:id', [
  optionalAuth,
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

    // 정책 상세 정보 조회
    const policy = await ontongService.getPolicyDetail(id);

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found'
      });
    }

    // 로그인한 사용자의 경우 북마크 상태 확인
    if (req.user) {
      const bookmarkResult = await db.query(
        'SELECT 1 FROM bookmarks WHERE user_id = $1 AND policy_id = $2',
        [req.user.id, id]
      );

      policy.isBookmarked = bookmarkResult.rows.length > 0;

      // 조회 로그 기록
      await db.query(
        'INSERT INTO interactions (user_id, policy_id, action) VALUES ($1, $2, $3)',
        [req.user.id, id, 'view']
      );
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

/**
 * 인기 정책 조회
 * GET /api/policies/popular
 */
router.get('/lists/popular', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await db.query(`
      SELECT * FROM popular_policies
      LIMIT $1
    `, [limit]);

    let policies = result.rows;

    // 로그인한 사용자의 경우 북마크 정보 추가
    if (req.user && policies.length > 0) {
      const policyIds = policies.map(p => p.id);
      const bookmarks = await db.query(
        'SELECT policy_id FROM bookmarks WHERE user_id = $1 AND policy_id = ANY($2)',
        [req.user.id, policyIds]
      );

      const bookmarkedIds = new Set(bookmarks.rows.map(b => b.policy_id));

      policies = policies.map(policy => ({
        ...policy,
        isBookmarked: bookmarkedIds.has(policy.id)
      }));
    }

    res.json({
      success: true,
      message: 'Popular policies retrieved successfully',
      data: {
        policies,
        count: policies.length
      }
    });

  } catch (error) {
    console.error('Get popular policies error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve popular policies'
    });
  }
});

/**
 * 마감 임박 정책 조회
 * GET /api/policies/deadline
 */
router.get('/lists/deadline', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await db.query(`
      SELECT * FROM deadline_approaching_policies
      LIMIT $1
    `, [limit]);

    let policies = result.rows;

    // 로그인한 사용자의 경우 북마크 정보 추가
    if (req.user && policies.length > 0) {
      const policyIds = policies.map(p => p.id);
      const bookmarks = await db.query(
        'SELECT policy_id FROM bookmarks WHERE user_id = $1 AND policy_id = ANY($2)',
        [req.user.id, policyIds]
      );

      const bookmarkedIds = new Set(bookmarks.rows.map(b => b.policy_id));

      policies = policies.map(policy => ({
        ...policy,
        isBookmarked: bookmarkedIds.has(policy.id)
      }));
    }

    res.json({
      success: true,
      message: 'Deadline approaching policies retrieved successfully',
      data: {
        policies,
        count: policies.length
      }
    });

  } catch (error) {
    console.error('Get deadline policies error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve deadline approaching policies'
    });
  }
});

/**
 * AI 추천 정책 조회
 * GET /api/policies/recommendations
 */
router.get('/lists/recommendations', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);

    // 사용자 프로필 기반 추천 로직 (간단한 버전)
    const userInterests = req.user.interests || [];
    const userAge = req.user.birth_date ?
      new Date().getFullYear() - new Date(req.user.birth_date).getFullYear() : null;

    let query = `
      SELECT p.*,
             COALESCE(p.popularity_score, 0) as score
      FROM policies p
      WHERE p.status = 'active'
        AND (p.deadline IS NULL OR p.deadline > CURRENT_DATE)
    `;

    const params = [];
    let paramIndex = 1;

    // 관심사 기반 필터링
    if (userInterests.length > 0) {
      query += ` AND p.category = ANY($${paramIndex})`;
      params.push(userInterests);
      paramIndex++;
    }

    // 나이 조건 필터링
    if (userAge) {
      query += ` AND (
        p.target_age IS NULL OR
        (p.target_age->>'min')::int <= $${paramIndex} AND
        (p.target_age->>'max')::int >= $${paramIndex}
      )`;
      params.push(userAge);
      paramIndex++;
    }

    query += ` ORDER BY score DESC, p.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query(query, params);
    let policies = result.rows;

    // 북마크 정보 추가
    if (policies.length > 0) {
      const policyIds = policies.map(p => p.id);
      const bookmarks = await db.query(
        'SELECT policy_id FROM bookmarks WHERE user_id = $1 AND policy_id = ANY($2)',
        [req.user.id, policyIds]
      );

      const bookmarkedIds = new Set(bookmarks.rows.map(b => b.policy_id));

      policies = policies.map(policy => ({
        ...policy,
        isBookmarked: bookmarkedIds.has(policy.id)
      }));
    }

    // 추천 기록 저장
    if (policies.length > 0) {
      await db.query(
        `INSERT INTO recommendations (user_id, policy_ids, algorithm_version, confidence_score)
         VALUES ($1, $2, $3, $4)`,
        [
          req.user.id,
          JSON.stringify(policies.map(p => p.id)),
          'v1.0',
          0.85
        ]
      );
    }

    res.json({
      success: true,
      message: 'Recommended policies retrieved successfully',
      data: {
        policies,
        count: policies.length,
        criteria: {
          interests: userInterests,
          age: userAge
        }
      }
    });

  } catch (error) {
    console.error('Get recommendations error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve recommendations'
    });
  }
});

/**
 * 정책 상호작용 기록
 * POST /api/policies/:id/interact
 */
router.post('/:id/interact', [
  authenticateToken,
  param('id')
    .notEmpty()
    .withMessage('Policy ID is required'),
  body('action')
    .isIn(['view', 'click', 'apply', 'share'])
    .withMessage('Invalid action type'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { action, metadata } = req.body;

    // 상호작용 기록
    await db.query(
      `INSERT INTO interactions (user_id, policy_id, action, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.id,
        id,
        action,
        JSON.stringify(metadata || {}),
        req.ip,
        req.headers['user-agent']
      ]
    );

    res.json({
      success: true,
      message: 'Interaction recorded successfully'
    });

  } catch (error) {
    console.error('Record interaction error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to record interaction'
    });
  }
});

module.exports = router;