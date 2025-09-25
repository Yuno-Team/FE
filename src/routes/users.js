const express = require('express');
const { body, param, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { authenticateToken, requireOwner, logRequest } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// 모든 사용자 라우트에 로깅 적용
router.use(logRequest);

/**
 * 내 프로필 조회
 * GET /api/users/me
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // 최신 사용자 정보 조회
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    const user = authService.sanitizeUser(result.rows[0]);

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve profile'
    });
  }
});

/**
 * 프로필 업데이트
 * PUT /api/users/me
 */
router.put('/me', [
  authenticateToken,
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('birth_date')
    .optional()
    .isISO8601()
    .withMessage('Birth date must be a valid date'),
  body('region')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Region must be less than 100 characters'),
  body('school')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('School must be less than 200 characters'),
  body('education')
    .optional()
    .isIn(['high_school', 'university', 'graduate'])
    .withMessage('Invalid education level'),
  body('major')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Major must be less than 100 characters'),
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array')
    .custom((interests) => {
      const validInterests = ['장학금', '창업지원', '취업지원', '주거지원', '생활복지', '문화', '참여권리'];
      return interests.every(interest => validInterests.includes(interest));
    })
    .withMessage('Invalid interest categories')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid profile data',
        details: errors.array()
      });
    }

    const profileData = req.body;

    // 프로필 업데이트
    const updatedUser = await authService.updateProfile(req.user.id, profileData);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: error.message || 'Failed to update profile'
    });
  }
});

/**
 * 북마크 목록 조회
 * GET /api/users/me/bookmarks
 */
router.get('/me/bookmarks', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    // 북마크된 정책 조회
    const result = await db.query(`
      SELECT
        p.*,
        b.created_at as bookmarked_at,
        true as isBookmarked
      FROM bookmarks b
      JOIN policies p ON b.policy_id = p.id
      WHERE b.user_id = $1
        AND p.status = 'active'
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    // 전체 개수 조회
    const countResult = await db.query(
      'SELECT COUNT(*) FROM bookmarks WHERE user_id = $1',
      [req.user.id]
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      message: 'Bookmarks retrieved successfully',
      data: {
        bookmarks: result.rows,
        pagination: {
          page,
          limit,
          total,
          hasNext: offset + limit < total
        }
      }
    });

  } catch (error) {
    console.error('Get bookmarks error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve bookmarks'
    });
  }
});

/**
 * 북마크 추가
 * POST /api/users/me/bookmarks
 */
router.post('/me/bookmarks', [
  authenticateToken,
  body('policyId')
    .notEmpty()
    .withMessage('Policy ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Policy ID is required',
        details: errors.array()
      });
    }

    const { policyId } = req.body;

    // 정책 존재 여부 확인
    const policyCheck = await db.query(
      'SELECT 1 FROM policies WHERE id = $1 AND status = $2',
      [policyId, 'active']
    );

    if (policyCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found or inactive'
      });
    }

    // 북마크 추가 (이미 존재하면 무시)
    const result = await db.query(
      `INSERT INTO bookmarks (user_id, policy_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, policy_id) DO NOTHING
       RETURNING *`,
      [req.user.id, policyId]
    );

    // 북마크 상호작용 기록
    await db.query(
      'INSERT INTO interactions (user_id, policy_id, action) VALUES ($1, $2, $3)',
      [req.user.id, policyId, 'bookmark']
    );

    res.json({
      success: true,
      message: result.rows.length > 0 ? 'Bookmark added successfully' : 'Policy already bookmarked',
      data: {
        isNew: result.rows.length > 0,
        policyId
      }
    });

  } catch (error) {
    console.error('Add bookmark error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to add bookmark'
    });
  }
});

/**
 * 북마크 삭제
 * DELETE /api/users/me/bookmarks/:policyId
 */
router.delete('/me/bookmarks/:policyId', [
  authenticateToken,
  param('policyId')
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

    const { policyId } = req.params;

    // 북마크 삭제
    const result = await db.query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND policy_id = $2 RETURNING *',
      [req.user.id, policyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Bookmark not found'
      });
    }

    // 북마크 해제 상호작용 기록
    await db.query(
      'INSERT INTO interactions (user_id, policy_id, action) VALUES ($1, $2, $3)',
      [req.user.id, policyId, 'unbookmark']
    );

    res.json({
      success: true,
      message: 'Bookmark removed successfully',
      data: {
        policyId
      }
    });

  } catch (error) {
    console.error('Remove bookmark error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to remove bookmark'
    });
  }
});

/**
 * 활동 통계 조회
 * GET /api/users/me/stats
 */
router.get('/me/stats', authenticateToken, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 통계 데이터 조회
    const stats = await db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN i.action = 'view' THEN i.policy_id END) as policies_viewed,
        COUNT(DISTINCT CASE WHEN i.action = 'bookmark' THEN i.policy_id END) as policies_bookmarked,
        COUNT(DISTINCT CASE WHEN i.action = 'apply' THEN i.policy_id END) as policies_applied,
        COUNT(*) as total_interactions,
        (SELECT COUNT(*) FROM bookmarks WHERE user_id = $1) as current_bookmarks
      FROM interactions i
      WHERE i.user_id = $1 AND i.created_at >= $2
    `, [req.user.id, thirtyDaysAgo]);

    // 관심 카테고리별 통계
    const categoryStats = await db.query(`
      SELECT
        p.category,
        COUNT(*) as interaction_count
      FROM interactions i
      JOIN policies p ON i.policy_id = p.id
      WHERE i.user_id = $1 AND i.created_at >= $2
      GROUP BY p.category
      ORDER BY interaction_count DESC
    `, [req.user.id, thirtyDaysAgo]);

    res.json({
      success: true,
      message: 'User statistics retrieved successfully',
      data: {
        period: '30days',
        summary: stats.rows[0],
        categoryBreakdown: categoryStats.rows
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve user statistics'
    });
  }
});

/**
 * 추천 기록 조회
 * GET /api/users/me/recommendations
 */
router.get('/me/recommendations', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await db.query(`
      SELECT
        r.*,
        array_length(r.policy_ids::json::text[], 1) as policy_count
      FROM recommendations r
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2
    `, [req.user.id, limit]);

    res.json({
      success: true,
      message: 'Recommendation history retrieved successfully',
      data: {
        recommendations: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get recommendation history error:', error);

    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve recommendation history'
    });
  }
});

module.exports = router;