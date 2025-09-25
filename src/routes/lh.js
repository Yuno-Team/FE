const express = require('express');
const LHService = require('../services/lhService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
const lhService = new LHService();

/**
 * LH 주택 정보 통합 조회
 * GET /api/lh/notices
 */
router.get('/notices', optionalAuth, async (req, res) => {
  try {
    const { youthOnly = false } = req.query;

    console.log('🏠 LH 주택 정보 조회 요청...');

    const result = await lhService.getAllLHNotices();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'LH 정보 수집 실패',
        message: result.error
      });
    }

    const data = youthOnly === 'true' ? result.data.youth : result.data.all;

    res.json({
      success: true,
      message: 'LH 주택 정보 조회 성공',
      data: {
        notices: data,
        total: data.length,
        summary: {
          totalNotices: result.data.total,
          youthNotices: result.data.youthTotal,
          sources: ['LH청약플러스', '마이홈포털', '공공데이터포털']
        },
        errors: result.errors
      }
    });

  } catch (error) {
    console.error('LH 정보 조회 오류:', error);

    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'LH 주택 정보 조회 중 오류가 발생했습니다.'
    });
  }
});

/**
 * LH 청년 전용 주택 정보
 * GET /api/lh/youth-housing
 */
router.get('/youth-housing', optionalAuth, async (req, res) => {
  try {
    const result = await lhService.getAllLHNotices();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'LH 청년 주택 정보 수집 실패'
      });
    }

    res.json({
      success: true,
      message: 'LH 청년 주택 정보 조회 성공',
      data: {
        notices: result.data.youth,
        total: result.data.youthTotal
      }
    });

  } catch (error) {
    console.error('LH 청년 주택 정보 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'LH 청년 주택 정보 조회 실패'
    });
  }
});

/**
 * 공공데이터포털 LH 임대주택 정보
 * GET /api/lh/public-data
 */
router.get('/public-data', optionalAuth, async (req, res) => {
  try {
    const { page = 1, perPage = 20 } = req.query;

    const result = await lhService.getPublicRentalHousing({
      page: parseInt(page),
      perPage: parseInt(perPage)
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: '공공데이터 조회 실패',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'LH 공공임대주택 정보 조회 성공',
      data: {
        housing: result.data,
        pagination: {
          page: parseInt(page),
          perPage: parseInt(perPage),
          total: result.totalCount
        }
      }
    });

  } catch (error) {
    console.error('공공데이터 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: '공공데이터 조회 실패'
    });
  }
});

module.exports = router;