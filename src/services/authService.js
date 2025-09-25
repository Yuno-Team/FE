const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');
const jwkToPem = require('jwk-to-pem');
const db = require('../config/database');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.tokenExpiry = '7d';
    this.refreshTokenExpiry = '30d';
  }

  /**
   * 소셜 로그인 처리
   */
  async socialLogin(provider, accessToken, deviceInfo = {}) {
    try {
      // 소셜 제공자에서 사용자 정보 가져오기
      const socialUserInfo = await this.getSocialUserInfo(provider, accessToken);

      if (!socialUserInfo) {
        throw new Error('소셜 로그인 실패: 사용자 정보를 가져올 수 없습니다');
      }

      // 기존 사용자 확인
      let user = await this.findUserBySocialId(socialUserInfo.id, provider);

      if (!user) {
        // 신규 사용자 생성
        user = await this.createUser({
          email: socialUserInfo.email,
          name: socialUserInfo.name,
          social_id: socialUserInfo.id,
          social_provider: provider,
          profile_image_url: socialUserInfo.picture
        });
      } else {
        // 기존 사용자 정보 업데이트
        await this.updateUser(user.id, {
          name: socialUserInfo.name,
          profile_image_url: socialUserInfo.picture,
          updated_at: new Date()
        });
      }

      // JWT 토큰 생성
      const tokens = await this.generateTokens(user);

      // 세션 정보 저장
      await this.createSession(user.id, tokens.accessToken, deviceInfo);

      return {
        user: this.sanitizeUser(user),
        tokens
      };

    } catch (error) {
      console.error(`${provider} 로그인 실패:`, error);
      throw error;
    }
  }

  /**
   * 소셜 제공자별 사용자 정보 조회
   */
  async getSocialUserInfo(provider, accessToken) {
    switch (provider.toLowerCase()) {
      case 'google':
        return await this.getGoogleUserInfo(accessToken);
      case 'kakao':
        return await this.getKakaoUserInfo(accessToken);
      case 'naver':
        return await this.getNaverUserInfo(accessToken);
      case 'apple':
        return await this.getAppleUserInfo(accessToken);
      default:
        throw new Error(`지원하지 않는 소셜 제공자: ${provider}`);
    }
  }

  /**
   * Google 사용자 정보 조회
   */
  async getGoogleUserInfo(accessTokenOrIdToken) {
    try {
      // id_token 형태면 tokeninfo로 검증/파싱
      if (typeof accessTokenOrIdToken === 'string' && accessTokenOrIdToken.split('.').length === 3) {
        const tokeninfo = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
          params: { id_token: accessTokenOrIdToken }
        });
        const data = tokeninfo.data;
        return {
          id: data.sub,
          email: data.email,
          name: data.name || 'Google User',
          picture: data.picture
        };
      }

      // access_token이면 userinfo로 조회
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessTokenOrIdToken}`
        }
      });

      const { id, email, name, picture } = response.data;

      return { id, email, name, picture };
    } catch (error) {
      console.error('Google 사용자 정보 조회 실패:', error);
      return null;
    }
  }

  /**
   * Kakao 사용자 정보 조회
   */
  async getKakaoUserInfo(accessToken) {
    try {
      const response = await axios.get('https://kapi.kakao.com/v2/user/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const { id, kakao_account } = response.data;
      const { email, profile } = kakao_account;

      return {
        id: id.toString(),
        email,
        name: profile.nickname,
        picture: profile.profile_image_url
      };
    } catch (error) {
      console.error('Kakao 사용자 정보 조회 실패:', error);
      return null;
    }
  }

  /**
   * Naver 사용자 정보 조회
   */
  async getNaverUserInfo(accessToken) {
    try {
      const response = await axios.get('https://openapi.naver.com/v1/nid/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const { id, email, name, profile_image } = response.data.response;

      return {
        id,
        email,
        name,
        picture: profile_image
      };
    } catch (error) {
      console.error('Naver 사용자 정보 조회 실패:', error);
      return null;
    }
  }

  /**
   * Apple 사용자 정보 조회 (id_token 검증)
   */
  async getAppleUserInfo(idToken) {
    try {
      if (!idToken) return null;

      const decodedHeader = jwt.decode(idToken, { complete: true });
      if (!decodedHeader || !decodedHeader.header) {
        throw new Error('Invalid Apple identity token');
      }

      const { kid, alg } = decodedHeader.header;
      if (alg !== 'RS256') {
        throw new Error('Unsupported Apple token algorithm');
      }

      // Fetch Apple's JWKS
      const jwksResp = await axios.get('https://appleid.apple.com/auth/keys');
      const keys = jwksResp.data.keys || [];
      const jwk = keys.find((k) => k.kid === kid && k.alg === 'RS256');
      if (!jwk) {
        throw new Error('Apple public key not found for token');
      }

      const pem = jwkToPem(jwk);

      // Verify token
      const clientId = process.env.APPLE_CLIENT_ID; // Service ID or native client_id
      const payload = jwt.verify(idToken, pem, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: clientId
      });

      const email = payload.email || `apple-${payload.sub}@privaterelay.appleid.com`;
      return {
        id: payload.sub,
        email,
        name: 'Apple User',
        picture: null
      };
    } catch (error) {
      console.error('Apple 사용자 정보 검증 실패:', error);
      return null;
    }
  }

  /**
   * 소셜 ID로 사용자 조회
   */
  async findUserBySocialId(socialId, provider) {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE social_id = $1 AND social_provider = $2 AND is_active = true',
        [socialId, provider]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('사용자 조회 실패:', error);
      return null;
    }
  }

  /**
   * 사용자 생성
   */
  async createUser(userData) {
    try {
      const result = await db.query(
        `INSERT INTO users (email, name, social_id, social_provider, profile_image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userData.email, userData.name, userData.social_id, userData.social_provider, userData.profile_image_url]
      );

      return result.rows[0];
    } catch (error) {
      console.error('사용자 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 사용자 정보 업데이트
   */
  async updateUser(userId, updateData) {
    try {
      const fields = Object.keys(updateData).map((key, index) => `${key} = $${index + 2}`).join(', ');
      const values = [userId, ...Object.values(updateData)];

      const result = await db.query(
        `UPDATE users SET ${fields} WHERE id = $1 RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (error) {
      console.error('사용자 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * JWT 토큰 생성
   */
  async generateTokens(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiry,
      issuer: 'yuno-api',
      subject: user.id.toString()
    });

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.jwtSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'yuno-api',
        subject: user.id.toString()
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiry(this.tokenExpiry)
    };
  }

  /**
   * 토큰 검증
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);

      // 사용자 존재 여부 확인
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('사용자를 찾을 수 없습니다');
      }

      return {
        valid: true,
        user: this.sanitizeUser(result.rows[0]),
        payload: decoded
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 리프레시 토큰으로 새 토큰 발급
   */
  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret);

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      // 사용자 조회
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('사용자를 찾을 수 없습니다');
      }

      const user = result.rows[0];

      // 새 토큰 생성
      const tokens = await this.generateTokens(user);

      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      console.error('토큰 갱신 실패:', error);
      throw error;
    }
  }

  /**
   * 세션 생성
   */
  async createSession(userId, accessToken, deviceInfo = {}) {
    try {
      const sessionToken = this.generateSessionToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7일 후 만료

      await db.query(
        `INSERT INTO user_sessions (user_id, session_token, device_info, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, sessionToken, JSON.stringify(deviceInfo), expiresAt]
      );

      return sessionToken;
    } catch (error) {
      console.error('세션 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 로그아웃
   */
  async logout(userId, sessionToken = null) {
    try {
      let query = 'DELETE FROM user_sessions WHERE user_id = $1';
      let params = [userId];

      if (sessionToken) {
        query += ' AND session_token = $2';
        params.push(sessionToken);
      }

      const result = await db.query(query, params);

      return {
        success: true,
        sessionsRemoved: result.rowCount
      };
    } catch (error) {
      console.error('로그아웃 실패:', error);
      throw error;
    }
  }

  /**
   * 모든 디바이스에서 로그아웃
   */
  async logoutAllDevices(userId) {
    return await this.logout(userId);
  }

  /**
   * 사용자 프로필 업데이트
   */
  async updateProfile(userId, profileData) {
    try {
      const allowedFields = [
        'name', 'birth_date', 'region', 'school', 'education',
        'major', 'interests', 'profile_image_url'
      ];

      const updateFields = {};
      for (const [key, value] of Object.entries(profileData)) {
        if (allowedFields.includes(key)) {
          updateFields[key] = value;
        }
      }

      if (Object.keys(updateFields).length === 0) {
        throw new Error('업데이트할 필드가 없습니다');
      }

      updateFields.updated_at = new Date();

      const user = await this.updateUser(userId, updateFields);

      return this.sanitizeUser(user);
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
      throw error;
    }
  }

  /**
   * 계정 삭제
   */
  async deleteAccount(userId) {
    try {
      await db.transaction(async (client) => {
        // 사용자 비활성화
        await client.query(
          'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [userId]
        );

        // 세션 삭제
        await client.query(
          'DELETE FROM user_sessions WHERE user_id = $1',
          [userId]
        );

        // 개인 데이터 익명화 (선택적)
        await client.query(
          'UPDATE users SET email = $1, name = $2, social_id = NULL WHERE id = $3',
          [`deleted_${userId}@yuno.app`, '탈퇴한 사용자', userId]
        );
      });

      return { success: true };
    } catch (error) {
      console.error('계정 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 사용자 정보 민감 데이터 제거
   */
  sanitizeUser(user) {
    const { social_id, ...sanitized } = user;
    return sanitized;
  }

  /**
   * 세션 토큰 생성
   */
  generateSessionToken() {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * 만료 시간을 초로 변환
   */
  parseExpiry(expiry) {
    const units = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // 기본 1시간

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * 비밀번호 해싱 (필요시 사용)
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, 12);
  }

  /**
   * 비밀번호 검증 (필요시 사용)
   */
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
}

module.exports = new AuthService();
