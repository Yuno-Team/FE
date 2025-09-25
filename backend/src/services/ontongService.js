const axios = require('axios');
const db = require('../config/database');

class OntongService {
  constructor() {
    this.apiKey = process.env.ONTONG_API_KEY;
    this.baseURL = process.env.ONTONG_API_BASE_URL || 'https://www.youthcenter.go.kr/openapi';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'User-Agent': 'Yuno-Backend/1.0'
      }
    });

    // 요청 인터셉터
    this.client.interceptors.request.use((config) => {
      console.log(`[ONTONG API] ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[ONTONG API ERROR]', error.message);
        throw error;
      }
    );
  }

  /**
   * 정책 목록 조회 (데이터베이스 우선)
   */
  async getPolicies(params = {}) {
    const {
      page = 1,
      limit = 20,
      category,
      region,
      searchText,
      ageMin,
      ageMax
    } = params;

    try {
      // 1단계: 데이터베이스에서 조회
      const dbResult = await this.getPoliciesFromDB(params);

      // 데이터가 충분하고 최신이면 반환
      if (dbResult.policies.length > 0 && this.isDataFresh(dbResult.lastCached)) {
        console.log(`[DB] 정책 조회 성공: ${dbResult.policies.length}개 (페이지 ${page})`);
        return dbResult;
      }

      // 2단계: 데이터가 부족하거나 오래된 경우 API 호출 후 캐시 업데이트
      console.log('[API] 정책 데이터 갱신 필요, 온통청년 API 호출...');

      try {
        const apiResult = await this.getPoliciesFromAPI(params);

        // API 데이터를 데이터베이스에 저장 (백그라운드)
        this.updateCacheInBackground(apiResult.policies, category);

        return apiResult;
      } catch (apiError) {
        console.error('온통청년 API 호출 실패, 캐시된 데이터 반환:', apiError.message);

        // API 실패시 오래된 캐시라도 반환
        return dbResult.policies.length > 0 ? dbResult : {
          policies: [],
          pagination: { page, limit, total: 0, hasNext: false }
        };
      }

    } catch (error) {
      console.error('정책 조회 중 오류:', error);

      // 모든 것이 실패하면 빈 결과 반환
      return {
        policies: [],
        pagination: { page, limit, total: 0, hasNext: false }
      };
    }
  }

  /**
   * 데이터베이스에서 정책 조회
   */
  async getPoliciesFromDB(params) {
    const {
      page = 1,
      limit = 20,
      category,
      region,
      searchText,
      ageMin,
      ageMax
    } = params;

    const offset = (page - 1) * limit;
    const conditions = ['status = $1'];
    const values = ['active'];
    let paramIndex = 2;

    // 조건 추가
    if (category) {
      conditions.push(`category = $${paramIndex}`);
      values.push(category);
      paramIndex++;
    }

    if (searchText) {
      conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      values.push(`%${searchText}%`);
      paramIndex++;
    }

    if (region) {
      conditions.push(`region @> $${paramIndex}`);
      values.push(JSON.stringify([region]));
      paramIndex++;
    }

    if (ageMin || ageMax) {
      if (ageMin && ageMax) {
        conditions.push(`(target_age->>'min')::int <= $${paramIndex} AND (target_age->>'max')::int >= $${paramIndex + 1}`);
        values.push(ageMax, ageMin);
        paramIndex += 2;
      } else if (ageMin) {
        conditions.push(`(target_age->>'max')::int >= $${paramIndex}`);
        values.push(ageMin);
        paramIndex++;
      } else if (ageMax) {
        conditions.push(`(target_age->>'min')::int <= $${paramIndex}`);
        values.push(ageMax);
        paramIndex++;
      }
    }

    const whereClause = conditions.join(' AND ');

    // 총 개수 조회
    const countQuery = `SELECT COUNT(*) as total FROM policies WHERE ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // 정책 목록 조회
    const query = `
      SELECT id, title, category, description, content, deadline, start_date, end_date,
             application_url, contact_info, requirements, benefits, documents, region,
             target_age, target_education, tags, image_url, status, view_count,
             popularity_score, cached_at, updated_at
      FROM policies
      WHERE ${whereClause}
      ORDER BY popularity_score DESC, updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limit, offset);
    const result = await db.query(query, values);

    return {
      policies: result.rows.map(row => this.transformDBPolicy(row)),
      pagination: {
        page,
        limit,
        total,
        hasNext: offset + limit < total
      },
      lastCached: result.rows.length > 0 ? result.rows[0].cached_at : null
    };
  }

  /**
   * 온통청년 API에서 정책 조회 (기존 방식)
   */
  async getPoliciesFromAPI(params) {
    const {
      page = 1,
      limit = 20,
      category,
      region,
      searchText,
      ageMin,
      ageMax
    } = params;

    // 온통청년 API 파라미터 구성
    const apiParams = {
      openApiVlak: this.apiKey,
      display: limit,
      pageIndex: page,
      ...(category && { bizTycdSel: this.mapCategoryToCode(category) }),
      ...(region && { srchPolicyRegion: region }),
      ...(searchText && { query: searchText })
    };

    const response = await this.client.get('/youthPolicy.json', {
      params: apiParams
    });

    const policies = this.transformPolicies(response.data);

    // 나이 필터링 (클라이언트 사이드)
    let filteredPolicies = policies;
    if (ageMin || ageMax) {
      filteredPolicies = policies.filter(policy => {
        if (!policy.target_age) return true;

        const policyAgeMin = policy.target_age.min || 0;
        const policyAgeMax = policy.target_age.max || 100;

        if (ageMin && ageMax) {
          return !(policyAgeMax < ageMin || policyAgeMin > ageMax);
        } else if (ageMin) {
          return policyAgeMax >= ageMin;
        } else if (ageMax) {
          return policyAgeMin <= ageMax;
        }

        return true;
      });
    }

    return {
      policies: filteredPolicies,
      pagination: {
        page,
        limit,
        total: response.data.totalCount || 0,
        hasNext: filteredPolicies.length === limit
      }
    };
  }

  /**
   * 데이터 신선도 확인 (6시간 이내면 신선함)
   */
  isDataFresh(cachedAt) {
    if (!cachedAt) return false;

    const now = new Date();
    const cached = new Date(cachedAt);
    const hoursDiff = (now - cached) / (1000 * 60 * 60);

    return hoursDiff < 6; // 6시간 이내면 신선함
  }

  /**
   * 데이터베이스 정책을 API 형식으로 변환
   */
  transformDBPolicy(row) {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      content: row.content,
      deadline: row.deadline,
      applicationPeriod: this.formatDateRange(row.start_date, row.end_date),
      applicationUrl: row.application_url,
      contactInfo: row.contact_info,
      requirements: row.requirements,
      benefits: row.benefits,
      documents: row.documents,
      region: row.region,
      targetAge: row.target_age,
      targetEducation: row.target_education,
      tags: row.tags,
      imageUrl: row.image_url,
      status: row.status,
      viewCount: row.view_count || 0,
      popularityScore: parseFloat(row.popularity_score) || 0,
      updatedAt: row.updated_at
    };
  }

  /**
   * 날짜 범위 포맷팅
   */
  formatDateRange(startDate, endDate) {
    if (!startDate && !endDate) return '-';

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('ko-KR');
    };

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    if (start && end) {
      return `${start} ~ ${end}`;
    } else if (start) {
      return `${start} ~`;
    } else if (end) {
      return `~ ${end}`;
    }

    return '-';
  }

  /**
   * 백그라운드에서 캐시 업데이트
   */
  updateCacheInBackground(policies, category) {
    // 비동기로 처리하여 응답 지연 방지
    setImmediate(async () => {
      try {
        console.log(`[CACHE] 백그라운드 캐시 업데이트 시작: ${policies.length}개 정책`);

        for (const policy of policies) {
          await this.upsertPolicyToCache(policy);
        }

        console.log(`[CACHE] 백그라운드 캐시 업데이트 완료`);
      } catch (error) {
        console.error('[CACHE] 백그라운드 캐시 업데이트 실패:', error);
      }
    });
  }

  /**
   * 단일 정책을 캐시에 저장/업데이트
   */
  async upsertPolicyToCache(policy) {
    const checkQuery = 'SELECT id FROM policies WHERE id = $1';
    const existing = await db.query(checkQuery, [policy.id]);

    if (existing.rows.length > 0) {
      // 업데이트
      const updateQuery = `
        UPDATE policies SET
          title = $2, category = $3, description = $4, content = $5,
          deadline = $6, start_date = $7, end_date = $8, application_url = $9,
          contact_info = $10, requirements = $11, benefits = $12, documents = $13,
          region = $14, target_age = $15, target_education = $16, tags = $17,
          image_url = $18, status = $19, cached_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await db.query(updateQuery, [
        policy.id, policy.title, policy.category, policy.description, policy.content,
        policy.deadline, policy.startDate, policy.endDate, policy.applicationUrl,
        JSON.stringify(policy.contactInfo), JSON.stringify(policy.requirements),
        JSON.stringify(policy.benefits), JSON.stringify(policy.documents),
        JSON.stringify(policy.region), JSON.stringify(policy.targetAge),
        JSON.stringify(policy.targetEducation), JSON.stringify(policy.tags),
        policy.imageUrl, 'active'
      ]);
    } else {
      // 삽입
      const insertQuery = `
        INSERT INTO policies (
          id, title, category, description, content, deadline, start_date, end_date,
          application_url, contact_info, requirements, benefits, documents, region,
          target_age, target_education, tags, image_url, status, cached_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

      await db.query(insertQuery, [
        policy.id, policy.title, policy.category, policy.description, policy.content,
        policy.deadline, policy.startDate, policy.endDate, policy.applicationUrl,
        JSON.stringify(policy.contactInfo), JSON.stringify(policy.requirements),
        JSON.stringify(policy.benefits), JSON.stringify(policy.documents),
        JSON.stringify(policy.region), JSON.stringify(policy.targetAge),
        JSON.stringify(policy.targetEducation), JSON.stringify(policy.tags),
        policy.imageUrl, 'active'
      ]);
    }
  }

  /**
   * 정책 상세 조회
   */
  async getPolicyDetail(policyId) {
    try {
      const response = await this.client.get('/youthPolicyDetail.json', {
        params: {
          openApiVlak: this.apiKey,
          bizId: policyId
        }
      });

      return this.transformPolicyDetail(response.data);

    } catch (error) {
      console.error('정책 상세 조회 실패:', error);

      // 캐시에서 상세 정보 조회
      const result = await db.query(
        'SELECT * FROM policies WHERE id = $1',
        [policyId]
      );

      return result.rows[0] || null;
    }
  }

  /**
   * 정책 데이터를 로컬 DB에 동기화
   */
  async syncPolicies() {
    try {
      console.log('정책 동기화 시작...');

      let page = 1;
      let totalSynced = 0;
      const limit = 100;

      while (true) {
        const data = await this.getPolicies({ page, limit });

        if (!data.policies || data.policies.length === 0) {
          break;
        }

        // 배치로 데이터베이스에 저장
        await this.savePoliciesBatch(data.policies);
        totalSynced += data.policies.length;

        console.log(`${totalSynced}개 정책 동기화 완료`);

        if (data.policies.length < limit) {
          break;
        }

        page++;

        // API 호출 제한을 고려한 딜레이
        await this.delay(1000);
      }

      console.log(`정책 동기화 완료: 총 ${totalSynced}개`);
      return totalSynced;

    } catch (error) {
      console.error('정책 동기화 실패:', error);
      throw error;
    }
  }

  /**
   * 온통청년 데이터를 내부 포맷으로 변환
   */
  transformPolicies(data) {
    if (!data.youthPolicy) return [];

    return data.youthPolicy.map(item => ({
      id: item.bizId,
      title: item.polyBizSjnm,
      category: this.mapCodeToCategory(item.bizTycdSel),
      description: item.polyItcnCn,
      content: item.sporCn,
      deadline: this.parseDate(item.rqutPrdCn),
      start_date: this.parseDate(item.rqutPrdCn, 'start'),
      end_date: this.parseDate(item.rqutPrdCn, 'end'),
      application_url: item.rqutUrla,
      requirements: this.parseRequirements(item.ageInfo),
      region: this.parseRegion(item.polyRlmCd),
      target_age: this.parseAge(item.ageInfo),
      tags: this.parseTags(item.keyword),
      cached_at: new Date()
    }));
  }

  /**
   * 정책 상세 데이터 변환
   */
  transformPolicyDetail(data) {
    const detail = data.youthPolicyDetail;

    return {
      ...this.transformPolicies({ youthPolicy: [detail] })[0],
      contact_info: {
        department: detail.cnsgNmor,
        phone: detail.tintCherCn,
        email: detail.cherCtpcCn
      },
      benefits: this.parseBenefits(detail.sporCn),
      documents: this.parseDocuments(detail.pstnPaprCn)
    };
  }

  /**
   * 배치로 정책 데이터 저장
   */
  async savePoliciesBatch(policies) {
    const values = policies.map(policy => [
      policy.id,
      policy.title,
      policy.category,
      policy.description,
      policy.content,
      policy.deadline,
      policy.start_date,
      policy.end_date,
      policy.application_url,
      JSON.stringify(policy.requirements || []),
      JSON.stringify(policy.region || []),
      JSON.stringify(policy.target_age || {}),
      JSON.stringify(policy.tags || []),
      policy.cached_at
    ]);

    const query = `
      INSERT INTO policies (
        id, title, category, description, content,
        deadline, start_date, end_date, application_url,
        requirements, region, target_age, tags, cached_at
      ) VALUES ${values.map((_, i) =>
        `($${i * 14 + 1}, $${i * 14 + 2}, $${i * 14 + 3}, $${i * 14 + 4}, $${i * 14 + 5},
         $${i * 14 + 6}, $${i * 14 + 7}, $${i * 14 + 8}, $${i * 14 + 9},
         $${i * 14 + 10}, $${i * 14 + 11}, $${i * 14 + 12}, $${i * 14 + 13}, $${i * 14 + 14})`
      ).join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        content = EXCLUDED.content,
        deadline = EXCLUDED.deadline,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        application_url = EXCLUDED.application_url,
        requirements = EXCLUDED.requirements,
        region = EXCLUDED.region,
        target_age = EXCLUDED.target_age,
        tags = EXCLUDED.tags,
        cached_at = EXCLUDED.cached_at,
        updated_at = CURRENT_TIMESTAMP
    `;

    const flatValues = values.flat();
    await db.query(query, flatValues);
  }

  /**
   * 캐시된 정책 데이터 조회
   */
  async getCachedPolicies(params = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        region,
        searchText
      } = params;

      let whereConditions = ["status = 'active'"];
      let queryParams = [];
      let paramIndex = 1;

      if (category) {
        whereConditions.push(`category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      if (region) {
        whereConditions.push(`region @> $${paramIndex}`);
        queryParams.push(JSON.stringify([region]));
        paramIndex++;
      }

      if (searchText) {
        whereConditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        queryParams.push(`%${searchText}%`);
        paramIndex++;
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT * FROM policies
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY popularity_score DESC, created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const result = await db.query(query, queryParams);

      // 전체 개수 조회
      const countQuery = `
        SELECT COUNT(*) FROM policies
        WHERE ${whereConditions.join(' AND ')}
      `;

      const countResult = await db.query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].count);

      return {
        policies: result.rows,
        pagination: {
          page,
          limit,
          total,
          hasNext: offset + limit < total
        }
      };

    } catch (error) {
      console.error('캐시된 정책 조회 실패:', error);
      return {
        policies: [],
        pagination: { page: 1, limit, total: 0, hasNext: false }
      };
    }
  }

  // 유틸리티 메서드들
  mapCategoryToCode(category) {
    const mapping = {
      '장학금': '023010',
      '창업지원': '023020',
      '취업지원': '023030',
      '주거지원': '023040',
      '생활복지': '023050',
      '문화': '023060',
      '참여권리': '023070'
    };
    return mapping[category] || '';
  }

  mapCodeToCategory(code) {
    const mapping = {
      '023010': '장학금',
      '023020': '창업지원',
      '023030': '취업지원',
      '023040': '주거지원',
      '023050': '생활복지',
      '023060': '문화',
      '023070': '참여권리'
    };
    return mapping[code] || '기타';
  }

  parseDate(dateString, type = 'end') {
    if (!dateString) return null;

    try {
      // "2024.01.01~2024.12.31" 형태 파싱
      const dates = dateString.match(/(\d{4}\.?\d{2}\.?\d{2})/g);
      if (!dates) return null;

      const dateIndex = type === 'start' ? 0 : dates.length - 1;
      const date = dates[dateIndex].replace(/\./g, '-');

      return new Date(date).toISOString().split('T')[0];
    } catch (error) {
      return null;
    }
  }

  parseAge(ageInfo) {
    if (!ageInfo) return null;

    try {
      const ageMatch = ageInfo.match(/(\d+).*?(\d+)/);
      if (ageMatch) {
        return {
          min: parseInt(ageMatch[1]),
          max: parseInt(ageMatch[2])
        };
      }

      const singleAge = ageInfo.match(/(\d+)/);
      if (singleAge) {
        const age = parseInt(singleAge[1]);
        return { min: age, max: age };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  parseRegion(regionCode) {
    // 지역 코드를 지역명으로 변환
    const regionMapping = {
      '003002001': '서울',
      '003002002': '부산',
      '003002003': '대구',
      // ... 더 많은 지역 코드 매핑
      '003002000': '전국'
    };

    return regionMapping[regionCode] ? [regionMapping[regionCode]] : ['전국'];
  }

  parseRequirements(ageInfo) {
    if (!ageInfo) return [];
    return [ageInfo];
  }

  parseTags(keyword) {
    if (!keyword) return [];
    return keyword.split(',').map(tag => tag.trim()).filter(Boolean);
  }

  parseBenefits(content) {
    if (!content) return [];
    // 지원내용 파싱 로직
    return [content];
  }

  parseDocuments(documents) {
    if (!documents) return [];
    return documents.split(',').map(doc => doc.trim()).filter(Boolean);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new OntongService();