const express = require('express');
// const authRoutes = require('./auth');  // 로그인 API 비활성화
const policyRoutes = require('./policies');
// const userRoutes = require('./users');  // 사용자 관리 API 비활성화
const lhRoutes = require('./lh');

const router = express.Router();

// API 버전 정보
router.get('/', (req, res) => {
  res.json({
    name: 'Yuno API',
    version: '1.0.0',
    description: 'Youth policy data service (온통청년 정책 API)',
    endpoints: {
      policies: '/api/policies',
      lh: '/api/lh'
    }
  });
});

// 라우트 등록 (로그인 관련 라우트 비활성화)
// router.use('/auth', authRoutes);  // 비활성화
router.use('/policies', policyRoutes);
// router.use('/users', userRoutes);  // 비활성화
router.use('/lh', lhRoutes);

module.exports = router;