const express = require('express');
const authRoutes = require('./auth');
const policyRoutes = require('./policies');
const userRoutes = require('./users');

const router = express.Router();

// API 버전 정보
router.get('/', (req, res) => {
  res.json({
    name: 'Yuno API',
    version: '1.0.0',
    description: 'AI-based youth policy recommendation service',
    endpoints: {
      auth: '/api/auth',
      policies: '/api/policies',
      users: '/api/users'
    }
  });
});

// 라우트 등록
router.use('/auth', authRoutes);
router.use('/policies', policyRoutes);
router.use('/users', userRoutes);

module.exports = router;