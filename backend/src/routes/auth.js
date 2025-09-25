const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { authenticateToken, logRequest } = require('../middleware/auth');

const router = express.Router();

// 모든 인증 라우트에 로깅 적용
router.use(logRequest);

/**
 * 소셜 로그인
 * POST /api/auth/social-login
 */
router.post('/social-login', [
  body('provider')
    .isIn(['google', 'kakao', 'naver', 'apple'])
    .withMessage('Invalid social provider'),
  // Either accessToken (google/kakao/naver) or idToken (apple or google alternative)
  body('accessToken').optional().isString(),
  body('idToken').optional().isString(),
  body('deviceInfo')
    .optional()
    .isObject()
    .withMessage('Device info must be an object')
], async (req, res) => {
  try {
    // 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors.array()
      });
    }

    const { provider, accessToken, idToken, deviceInfo } = req.body;

    // Provider-specific token requirement checks
    if (provider === 'apple' && !idToken) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Apple login requires idToken'
      });
    }
    if (provider !== 'apple' && !accessToken && !idToken) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Access token (or idToken) is required'
      });
    }

    // 소셜 로그인 처리
    const token = idToken || accessToken;
    const result = await authService.socialLogin(provider, token, deviceInfo);

    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });

  } catch (error) {
    console.error('Social login error:', error);

    res.status(400).json({
      error: 'Login Failed',
      message: error.message || 'Social login failed'
    });
  }
});

/**
 * 토큰 갱신
 * POST /api/auth/refresh
 */
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Refresh token is required',
        details: errors.array()
      });
    }

    const { refreshToken } = req.body;

    const result = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: result
    });

  } catch (error) {
    console.error('Token refresh error:', error);

    res.status(401).json({
      error: 'Token Refresh Failed',
      message: error.message || 'Invalid refresh token'
    });
  }
});

/**
 * 토큰 검증
 * GET /api/auth/verify
 */
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user,
      tokenPayload: {
        iat: req.tokenPayload.iat,
        exp: req.tokenPayload.exp,
        iss: req.tokenPayload.iss
      }
    }
  });
});

/**
 * 로그아웃
 * POST /api/auth/logout
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const sessionToken = req.headers['x-session-token'];

    const result = await authService.logout(req.user.id, sessionToken);

    res.json({
      success: true,
      message: 'Logout successful',
      data: result
    });

  } catch (error) {
    console.error('Logout error:', error);

    res.status(500).json({
      error: 'Logout Failed',
      message: error.message || 'Logout failed'
    });
  }
});

/**
 * 모든 디바이스에서 로그아웃
 * POST /api/auth/logout-all
 */
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const result = await authService.logoutAllDevices(req.user.id);

    res.json({
      success: true,
      message: 'Logged out from all devices',
      data: result
    });

  } catch (error) {
    console.error('Logout all error:', error);

    res.status(500).json({
      error: 'Logout Failed',
      message: error.message || 'Logout from all devices failed'
    });
  }
});

/**
 * 계정 삭제
 * DELETE /api/auth/account
 */
router.delete('/account', [
  authenticateToken,
  body('confirm')
    .equals('DELETE_MY_ACCOUNT')
    .withMessage('Confirmation text must be "DELETE_MY_ACCOUNT"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Account deletion confirmation required',
        details: errors.array()
      });
    }

    const result = await authService.deleteAccount(req.user.id);

    res.json({
      success: true,
      message: 'Account deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('Account deletion error:', error);

    res.status(500).json({
      error: 'Account Deletion Failed',
      message: error.message || 'Account deletion failed'
    });
  }
});

module.exports = router;
