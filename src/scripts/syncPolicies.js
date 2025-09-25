#!/usr/bin/env node

const axios = require('axios');
const db = require('../config/database');
require('dotenv').config();

class PolicySyncService {
  constructor() {
    this.apiKey = process.env.ONTONG_API_KEY;
    this.baseURL = process.env.ONTONG_API_BASE_URL || 'https://www.youthcenter.go.kr/openapi';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'User-Agent': 'Yuno-Backend/1.0'
      }
    });

    this.categories = [
      '장학금', '창업지원', '취업지원', '주거지원',
      '생활복지', '문화', '참여권리'
    ];
  }

  /**
   * 모든 정책을 동기화
   */
  async syncAllPolicies() {
    const startTime = Date.now();
    let totalSynced = 0;
    let totalUpdated = 0;
    let totalInserted = 0;
    let errors = [];

    console.log(`\n🚀 정책 동기화 시작: ${new Date().toISOString()}`);

    try {
      // 각 카테고리별로 정책 동기화
      for (const category of this.categories) {
        console.log(`\n📋 카테고리 동기화 중: ${category}`);

        try {
          const result = await this.syncCategoryPolicies(category);
          totalSynced += result.total;
          totalUpdated += result.updated;
          totalInserted += result.inserted;

          console.log(`   ✅ ${category}: ${result.total}개 (신규: ${result.inserted}, 업데이트: ${result.updated})`);
        } catch (error) {
          console.error(`   ❌ ${category} 동기화 실패:`, error.message);
          errors.push({ category, error: error.message });
        }
      }

      // 사용되지 않는 정책 비활성화
      const inactiveCount = await this.deactivateOldPolicies();

      const duration = (Date.now() - startTime) / 1000;

      // 동기화 결과 로깅
      await this.logSyncResult({
        totalSynced,
        totalUpdated,
        totalInserted,
        inactiveCount,
        duration,
        errors
      });

      console.log(`\n🎉 동기화 완료!`);
      console.log(`   📊 총 ${totalSynced}개 정책 동기화`);
      console.log(`   🆕 신규: ${totalInserted}개`);
      console.log(`   🔄 업데이트: ${totalUpdated}개`);
      console.log(`   ⏸️  비활성화: ${inactiveCount}개`);
      console.log(`   ⏱️  소요시간: ${duration.toFixed(2)}초`);

      if (errors.length > 0) {
        console.log(`   ⚠️  오류: ${errors.length}개 카테고리에서 실패`);
      }

    } catch (error) {
      console.error('❌ 동기화 중 치명적 오류:', error);
      process.exit(1);
    }
  }

  /**
   * 특정 카테고리의 정책들을 동기화
   */
  async syncCategoryPolicies(category, page = 1, totalResults = { total: 0, updated: 0, inserted: 0 }) {
    const limit = 50; // 한 번에 가져올 정책 수

    try {
      const response = await this.client.get('/youthPolicy.json', {
        params: {
          openApiVlak: this.apiKey,
          display: limit,
          pageIndex: page,
          bizTycdSel: this.mapCategoryToCode(category)
        }
      });

      if (!response.data || !response.data.youthPolicy) {
        console.log(`     페이지 ${page}: 데이터 없음`);
        return totalResults;
      }

      const policies = Array.isArray(response.data.youthPolicy)
        ? response.data.youthPolicy
        : [response.data.youthPolicy];

      // 각 정책을 데이터베이스에 저장/업데이트
      for (const policyData of policies) {
        try {
          const transformed = this.transformPolicy(policyData, category);
          const result = await this.upsertPolicy(transformed);

          if (result === 'inserted') {
            totalResults.inserted++;
          } else if (result === 'updated') {
            totalResults.updated++;
          }
          totalResults.total++;

        } catch (error) {
          console.error(`     정책 저장 실패 (ID: ${policyData.bizId}):`, error.message);
        }
      }

      console.log(`     페이지 ${page}: ${policies.length}개 처리`);

      // 다음 페이지가 있으면 재귀 호출
      if (policies.length === limit && page < 10) { // 최대 10페이지까지
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        return await this.syncCategoryPolicies(category, page + 1, totalResults);
      }

      return totalResults;

    } catch (error) {
      console.error(`     페이지 ${page} 조회 실패:`, error.message);
      throw error;
    }
  }

  /**
   * 정책을 데이터베이스에 저장하거나 업데이트
   */
  async upsertPolicy(policy) {
    const checkQuery = 'SELECT id, updated_at FROM policies WHERE id = $1';
    const existingPolicy = await db.query(checkQuery, [policy.id]);

    if (existingPolicy.rows.length > 0) {
      // 기존 정책 업데이트
      const updateQuery = `
        UPDATE policies SET
          title = $2,
          category = $3,
          description = $4,
          content = $5,
          deadline = $6,
          start_date = $7,
          end_date = $8,
          application_url = $9,
          contact_info = $10,
          requirements = $11,
          benefits = $12,
          documents = $13,
          region = $14,
          target_age = $15,
          target_education = $16,
          tags = $17,
          image_url = $18,
          status = $19,
          cached_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
      `;

      await db.query(updateQuery, [
        policy.id, policy.title, policy.category, policy.description,
        policy.content, policy.deadline, policy.start_date, policy.end_date,
        policy.application_url, JSON.stringify(policy.contact_info),
        JSON.stringify(policy.requirements), JSON.stringify(policy.benefits),
        JSON.stringify(policy.documents), JSON.stringify(policy.region),
        JSON.stringify(policy.target_age), JSON.stringify(policy.target_education),
        JSON.stringify(policy.tags), policy.image_url, policy.status
      ]);

      return 'updated';
    } else {
      // 새 정책 삽입
      const insertQuery = `
        INSERT INTO policies (
          id, title, category, description, content, deadline, start_date, end_date,
          application_url, contact_info, requirements, benefits, documents, region,
          target_age, target_education, tags, image_url, status, cached_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING id
      `;

      await db.query(insertQuery, [
        policy.id, policy.title, policy.category, policy.description,
        policy.content, policy.deadline, policy.start_date, policy.end_date,
        policy.application_url, JSON.stringify(policy.contact_info),
        JSON.stringify(policy.requirements), JSON.stringify(policy.benefits),
        JSON.stringify(policy.documents), JSON.stringify(policy.region),
        JSON.stringify(policy.target_age), JSON.stringify(policy.target_education),
        JSON.stringify(policy.tags), policy.image_url, policy.status
      ]);

      return 'inserted';
    }
  }

  /**
   * 7일 이상 업데이트되지 않은 정책들을 비활성화
   */
  async deactivateOldPolicies() {
    const query = `
      UPDATE policies
      SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
      WHERE cached_at < NOW() - INTERVAL '7 days'
        AND status = 'active'
      RETURNING id
    `;

    const result = await db.query(query);
    return result.rows.length;
  }

  /**
   * 동기화 결과를 관리자 알림으로 기록
   */
  async logSyncResult(result) {
    const query = `
      INSERT INTO admin_notifications (type, title, message, data)
      VALUES ($1, $2, $3, $4)
    `;

    const type = result.errors.length > 0 ? 'warning' : 'info';
    const title = `정책 동기화 완료 (${new Date().toLocaleDateString()})`;
    const message = `총 ${result.totalSynced}개 정책 동기화 (신규: ${result.totalInserted}, 업데이트: ${result.totalUpdated})`;

    await db.query(query, [type, title, message, JSON.stringify(result)]);
  }

  /**
   * 온통청년 API 정책 데이터를 내부 형식으로 변환
   */
  transformPolicy(apiData, category) {
    // 날짜 파싱 함수
    const parseDate = (dateStr) => {
      if (!dateStr || dateStr === '-') return null;

      // YYYY.MM.DD 또는 YYYY-MM-DD 형식 처리
      const cleaned = dateStr.replace(/[^\d-]/g, '-').replace(/--+/g, '-');
      const date = new Date(cleaned);
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    };

    // 나이 정보 파싱
    const parseAge = (ageStr) => {
      if (!ageStr || ageStr === '-') return null;

      const match = ageStr.match(/(\d+).*?(\d+)/);
      if (match) {
        return { min: parseInt(match[1]), max: parseInt(match[2]) };
      }

      const singleMatch = ageStr.match(/(\d+)/);
      if (singleMatch) {
        const age = parseInt(singleMatch[1]);
        return { min: age, max: age + 10 }; // 기본 범위
      }

      return null;
    };

    return {
      id: apiData.bizId?.toString() || `policy_${Date.now()}`,
      title: apiData.polyBizSjnm || '제목 없음',
      category: category,
      description: apiData.polyItcnCn || '',
      content: apiData.cnsgNmor || '',
      deadline: parseDate(apiData.rqutPrdCn),
      start_date: parseDate(apiData.rqutPrdCn?.split('~')[0]),
      end_date: parseDate(apiData.rqutPrdCn?.split('~')[1]),
      application_url: apiData.rqutUrla || null,
      contact_info: {
        department: apiData.cnsgNmor || '',
        phone: apiData.cherCtpcCn || '',
        institution: apiData.mngtMson || ''
      },
      requirements: this.parseListField(apiData.polyRlmCd),
      benefits: this.parseListField(apiData.sporCn),
      documents: this.parseListField(apiData.rqutProcCn),
      region: this.parseListField(apiData.polyBizTy),
      target_age: parseAge(apiData.ageInfo),
      target_education: this.parseListField(apiData.accrRqisCn),
      tags: this.generateTags(apiData),
      image_url: null,
      status: 'active'
    };
  }

  /**
   * 텍스트 필드를 배열로 파싱
   */
  parseListField(text) {
    if (!text || text === '-') return [];

    return text
      .split(/[,\n·•]/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  /**
   * 정책 데이터에서 태그 생성
   */
  generateTags(apiData) {
    const tags = [];

    if (apiData.polyBizTy && apiData.polyBizTy !== '-') {
      tags.push(apiData.polyBizTy);
    }

    if (apiData.polyRlmCd && apiData.polyRlmCd !== '-') {
      tags.push('온라인신청');
    }

    return tags;
  }

  /**
   * 카테고리를 온통청년 API 코드로 매핑
   */
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
}

// 스크립트 실행
async function main() {
  const syncService = new PolicySyncService();

  try {
    await syncService.syncAllPolicies();
    console.log('\n✅ 정책 동기화가 성공적으로 완료되었습니다.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 정책 동기화 중 오류 발생:', error);
    process.exit(1);
  }
}

// 직접 실행시에만 main 함수 호출
if (require.main === module) {
  main();
}

module.exports = PolicySyncService;