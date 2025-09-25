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
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      content: row.content,
      deadline: row.deadline,
      application_url: row.application_url,
      requirements: row.requirements || [],
      benefits: row.benefits || [],
      region: row.region || [],
      target_age: row.target_age || {},
      view_count: row.view_count || 0,
      status: row.status
    };
  }

  transformAPIResponse(data) {
    if (!data.result?.youthPolicyList) return [];

    const list = Array.isArray(data.result.youthPolicyList)
      ? data.result.youthPolicyList
      : [data.result.youthPolicyList];

    return list.map(item => ({
      id: item.plcyNo,
      title: item.plcyNm,
      category: item.lclsfNm,
      description: item.plcyExplnCn,
      content: item.plcySprtCn,
      deadline: item.aplyYmd,
      application_url: item.aplyUrlAddr,
      requirements: item.addAplyQlfcCndCn ? [item.addAplyQlfcCndCn] : [],
      benefits: item.plcySprtCn ? [item.plcySprtCn] : [],
      region: item.rgtrInstCdNm ? [item.rgtrInstCdNm] : [],
      target_age: {
        min: parseInt(item.sprtTrgtMinAge) || 18,
        max: parseInt(item.sprtTrgtMaxAge) || 39
      },
      view_count: parseInt(item.inqCnt) || 0,
      status: 'active'
    }));
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
          policy.application_url, JSON.stringify(policy.requirements),
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
        application_url: 'https://example.com',
        requirements: ['만 18-39세'],
        benefits: ['5천만원'],
        region: ['전국'],
        target_age: { min: 18, max: 39 },
        view_count: 100,
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