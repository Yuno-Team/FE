const axios = require('axios');
const db = require('../config/database');

class OntongService {
  constructor() {
    this.apiKey = process.env.ONTONG_API_KEY || 'ad635a05-453c-41a0-9d93-78bcd8de81bf';
    this.client = axios.create({
      baseURL: 'https://www.youthcenter.go.kr/go/ythip',
      timeout: 10000
    });
  }

  async getPolicies(params = {}) {
    const { page = 1, limit = 20, category, searchText } = params;

    // 먼저 DB에서 조회
    try {
      const offset = (page - 1) * limit;
      let query = 'SELECT * FROM policies WHERE status = $1';
      const queryParams = ['active'];
      let paramIndex = 2;

      if (category) {
        query += ` AND category = $${paramIndex}`;
        queryParams.push(category);
        paramIndex++;
      }

      if (searchText) {
        query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        queryParams.push(`%${searchText}%`);
        paramIndex++;
      }

      // 전체 카운트
      const countResult = await db.query(query.replace('*', 'COUNT(*)'), queryParams);
      const total = parseInt(countResult.rows[0]?.count || 0);

      // 페이지네이션
      query += ` ORDER BY cached_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      const result = await db.query(query, queryParams);

      if (result.rows.length > 0) {
        console.log(`DB에서 ${result.rows.length}개 정책 조회`);
        return {
          policies: result.rows.map(row => this.transformDBPolicy(row)),
          pagination: {
            page,
            limit,
            total,
            hasNext: offset + limit < total
          }
        };
      }
    } catch (dbError) {
      console.log('DB 조회 실패, API 호출:', dbError.message);
    }

    // DB가 비어있으면 API 호출
    try {
      const response = await this.client.get('/getPlcy', {
        params: {
          apiKeyNm: this.apiKey,
          pageNum: page,
          pageSize: limit,
          pageType: 1,
          rtnType: 'json',
          ...(category && { lclsfNm: category }),
          ...(searchText && { plcyNm: searchText })
        }
      });

      const policies = this.transformAPIResponse(response.data);

      // 백그라운드로 DB 저장
      this.saveToDB(policies).catch(console.error);

      return {
        policies,
        pagination: {
          page,
          limit,
          total: response.data.result?.pagging?.totCount || policies.length,
          hasNext: policies.length === limit
        }
      };
    } catch (apiError) {
      console.error('API 호출 실패:', apiError.message);
      return this.getMockData(params);
    }
  }

  async getPolicyDetail(id) {
    // DB에서 먼저 조회
    try {
      const result = await db.query('SELECT * FROM policies WHERE id = $1', [id]);
      if (result.rows[0]) {
        return this.transformDBPolicy(result.rows[0]);
      }
    } catch (err) {
      console.log('DB 상세 조회 실패');
    }

    // API 호출
    try {
      const response = await this.client.get('/getPlcy', {
        params: {
          apiKeyNm: this.apiKey,
          pageType: 2,
          plcyNo: id,
          rtnType: 'json'
        }
      });
      return this.transformAPIResponse(response.data)[0];
    } catch (error) {
      return null;
    }
  }

  transformDBPolicy(row) {
    const startDate = row.start_date ? new Date(row.start_date) : null;
    const endDate = row.end_date ? new Date(row.end_date) : null;

    return {
      id: row.id,
      title: row.title,
      category: row.category || '미분류',
      description: row.description,
      content: row.content,
      deadline: row.deadline,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      applicationPeriod: this.formatApplicationPeriod(startDate, endDate),
      applicationUrl: row.application_url,
      requirements: row.requirements || [],
      benefits: row.benefits || [],
      region: row.region || [],
      target_age: row.target_age || {},
      saves: row.view_count || 0,
      view_count: row.view_count || 0,
      isBookmarked: false,
      status: row.status
    };
  }

  transformAPIResponse(data) {
    if (!data.result?.youthPolicyList) return [];

    const list = Array.isArray(data.result.youthPolicyList)
      ? data.result.youthPolicyList
      : [data.result.youthPolicyList];

    return list.map(item => {
      const startDate = this.parseDate(item.bizPrdBgngYmd);
      const endDate = this.parseDate(item.bizPrdEndYmd);

      return {
        id: item.plcyNo,
        title: item.plcyNm,
        category: item.lclsfNm || '미분류',
        description: item.plcyExplnCn,
        content: item.plcySprtCn,
        deadline: item.aplyYmd,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        applicationPeriod: this.formatApplicationPeriod(startDate, endDate),
        applicationUrl: item.aplyUrlAddr,
        requirements: item.addAplyQlfcCndCn ? [item.addAplyQlfcCndCn] : [],
        benefits: item.plcySprtCn ? [item.plcySprtCn] : [],
        region: item.rgtrInstCdNm ? [item.rgtrInstCdNm] : [],
        target_age: {
          min: parseInt(item.sprtTrgtMinAge) || 18,
          max: parseInt(item.sprtTrgtMaxAge) || 39
        },
        saves: parseInt(item.inqCnt) || 0,
        view_count: parseInt(item.inqCnt) || 0,
        isBookmarked: false,
        status: 'active'
      };
    });
  }

  formatApplicationPeriod(startDate, endDate) {
    if (startDate && endDate) {
      const start = this.formatDate(startDate);
      const end = this.formatDate(endDate);
      return `${start} ~ ${end}`;
    } else if (endDate) {
      return `마감: ${this.formatDate(endDate)}`;
    }
    return '기간 미정';
  }

  formatDate(date) {
    if (!date) return '';
    return `${date.getFullYear()}.${(date.getMonth() + 1).toString().padLeft(2, '0')}.${date.getDate().toString().padLeft(2, '0')}`;
  }

  parseDate(dateStr) {
    if (!dateStr || dateStr === '0000-00-00') return null;
    try {
      // YYYYMMDD 형식을 YYYY-MM-DD로 변환
      if (dateStr.length === 8 && !dateStr.includes('-')) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return new Date(`${year}-${month}-${day}`);
      }
      return new Date(dateStr);
    } catch (e) {
      return null;
    }
  }

  async saveToDB(policies) {
    for (const policy of policies) {
      try {
        await db.query(`
          INSERT INTO policies (
            id, title, category, description, content,
            deadline, application_url, requirements, benefits,
            region, target_age, view_count, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            updated_at = CURRENT_TIMESTAMP
        `, [
          policy.id, policy.title, policy.category,
          policy.description, policy.content, policy.deadline,
          policy.applicationUrl, JSON.stringify(policy.requirements),
          JSON.stringify(policy.benefits), JSON.stringify(policy.region),
          JSON.stringify(policy.target_age), policy.view_count, policy.status
        ]);
      } catch (err) {
        console.error('DB 저장 실패:', err.message);
      }
    }
  }

  getMockData(params) {
    const mockPolicies = [
      {
        id: 'M001',
        title: '청년 창업 지원',
        category: '창업지원',
        description: '창업 지원 프로그램',
        content: '창업 자금 지원',
        deadline: '2024-12-31',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T00:00:00.000Z',
        applicationPeriod: '2024.01.01 ~ 2024.12.31',
        applicationUrl: 'https://example.com',
        requirements: ['만 18-39세'],
        benefits: ['5천만원'],
        region: ['전국'],
        target_age: { min: 18, max: 39 },
        saves: 100,
        view_count: 100,
        isBookmarked: false,
        status: 'active'
      }
    ];

    return {
      policies: mockPolicies,
      pagination: { page: 1, limit: 20, total: 1, hasNext: false }
    };
  }
}

module.exports = new OntongService();