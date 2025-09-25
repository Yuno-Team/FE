const authService = require('../services/authService');

/**
 * JWT 토큰 인증 미들웨어
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required'
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token format'
      });
    }

    const verification = await authService.verifyToken(token);

    if (!verification.valid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: verification.error || 'Invalid token'
      });
    }

    // 요청 객체에 사용자 정보 추가
    req.user = verification.user;
    req.tokenPayload = verification.payload;

    next();
  } catch (error) {
    console.error('Token authentication error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed'
    });
  }
};

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없어도 통과)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      req.user = null;
      return next();
    }

    const verification = await authService.verifyToken(token);

    if (verification.valid) {
      req.user = verification.user;
      req.tokenPayload = verification.payload;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * 관리자 권한 확인 미들웨어
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }

  next();
};

/**
 * 사용자 본인 확인 미들웨어
 */
const requireOwner = (paramName = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const targetUserId = parseInt(req.params[paramName]);

    if (req.user.id !== targetUserId && !req.user.is_admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied'
      });
    }

    next();
  };
};

/**
 * API 키 검증 미들웨어 (외부 API 호출용)
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!apiKey || !validApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required'
    });
  }

  if (apiKey !== validApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }

  next();
};

/**
 * 사용자 활성 상태 확인 미들웨어
 */
const requireActiveUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (!req.user.is_active) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Account is inactive'
    });
  }

  next();
};

/**
 * 요청 로깅 미들웨어
 */
const logRequest = (req, res, next) => {
  const userId = req.user ? req.user.id : 'anonymous';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - User: ${userId}, IP: ${ip}, UA: ${userAgent}`);

  next();
};

/**
 * 에러 핸들링 미들웨어
 */
const handleAuthError = (error, req, res, next) => {
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token expired'
    });
  }

  if (error.name === 'NotBeforeError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token not yet valid'
    });
  }

  next(error);
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireOwner,
  validateApiKey,
  requireActiveUser,
  logRequest,
  handleAuthError
};