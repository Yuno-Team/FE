#!/usr/bin/env node

/**
 * Mock 데이터로 정책 동기화 테스트
 */

require('dotenv').config();
const db = require('../config/database');

class MockPolicySyncService {
  constructor() {
    this.mockPolicies = [
      {
        id: 'R202400001',
        title: '청년 창업 지원사업',
        category: '창업지원',
        description: '창업을 희망하는 청년들을 위한 자금 지원 및 멘토링 프로그램',
        content: '창업 아이디어가 있는 만 18-39세 청년을 대상으로 초기 자금 지원',
        deadline: new Date('2024-12-31'),
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        application_url: 'https://www.k-startup.go.kr',
        requirements: JSON.stringify(['만 18-39세', '창업 아이디어 보유', '사업계획서 제출']),
        benefits: JSON.stringify(['최대 5,000만원 지원', '멘토링 프로그램', '사무공간 지원']),
        region: JSON.stringify(['전국']),
        target_age: JSON.stringify({ min: 18, max: 39 }),
        popularity_score: 85.5,
        view_count: 1200,
        application_count: 450,
        status: 'active'
      },
      {
        id: 'R202400002',
        title: '대학생 국가장학금',
        category: '장학금',
        description: '경제적 여건에 관계없이 누구나 의지와 능력에 따라 고등교육 기회를 가질 수 있도록 지원',
        content: '소득분위 8분위 이하 대학생에게 등록금 부담 완화를 위한 장학금 지원',
        deadline: new Date('2024-11-30'),
        start_date: new Date('2024-03-01'),
        end_date: new Date('2024-11-30'),
        application_url: 'https://www.kosaf.go.kr',
        requirements: JSON.stringify(['대학 재학생', '소득분위 8분위 이하', '성적 기준 충족']),
        benefits: JSON.stringify(['등록금 전액 또는 일부 지원']),
        region: JSON.stringify(['전국']),
        target_age: JSON.stringify({ min: 18, max: 35 }),
        popularity_score: 92.3,
        view_count: 2800,
        application_count: 1200,
        status: 'active'
      },
      {
        id: 'R202400003',
        title: '청년 주거 지원사업',
        category: '주거지원',
        description: '청년들의 주거비 부담 완화를 위한 임대료 지원',
        content: '만 19-39세 청년 1인 가구 대상 월임대료 지원',
        deadline: new Date('2024-10-15'),
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-10-15'),
        application_url: 'https://www.myhome.go.kr',
        requirements: JSON.stringify(['만 19-39세', '1인 가구', '소득 요건 충족']),
        benefits: JSON.stringify(['월 최대 20만원 임대료 지원', '최대 12개월']),
        region: JSON.stringify(['서울', '경기', '인천']),
        target_age: JSON.stringify({ min: 19, max: 39 }),
        popularity_score: 78.9,
        view_count: 980,
        application_count: 320,
        status: 'active'
      }
    ];
  }

  async testConnection() {
    try {
      await db.testConnection();
      console.log('✅ 데이터베이스 연결 성공');
      return true;
    } catch (error) {
      console.error('❌ 데이터베이스 연결 실패:', error.message);
      return false;
    }
  }

  async insertMockPolicies() {
    try {
      let inserted = 0;
      let updated = 0;

      for (const policy of this.mockPolicies) {
        // 기존 정책 존재 여부 확인
        const existing = await db.query('SELECT id FROM policies WHERE id = $1', [policy.id]);

        if (existing.rows.length > 0) {
          // 업데이트
          await db.query(`
            UPDATE policies SET
              title = $2,
              category = $3,
              description = $4,
              content = $5,
              deadline = $6,
              start_date = $7,
              end_date = $8,
              application_url = $9,
              requirements = $10,
              benefits = $11,
              region = $12,
              target_age = $13,
              popularity_score = $14,
              view_count = $15,
              application_count = $16,
              status = $17,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [
            policy.id, policy.title, policy.category, policy.description,
            policy.content, policy.deadline, policy.start_date, policy.end_date,
            policy.application_url, policy.requirements, policy.benefits,
            policy.region, policy.target_age, policy.popularity_score,
            policy.view_count, policy.application_count, policy.status
          ]);
          updated++;
        } else {
          // 삽입
          await db.query(`
            INSERT INTO policies (
              id, title, category, description, content, deadline, start_date,
              end_date, application_url, requirements, benefits, region,
              target_age, popularity_score, view_count, application_count, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          `, [
            policy.id, policy.title, policy.category, policy.description,
            policy.content, policy.deadline, policy.start_date, policy.end_date,
            policy.application_url, policy.requirements, policy.benefits,
            policy.region, policy.target_age, policy.popularity_score,
            policy.view_count, policy.application_count, policy.status
          ]);
          inserted++;
        }
      }

      return { total: this.mockPolicies.length, inserted, updated };
    } catch (error) {
      console.error('Mock 정책 삽입 실패:', error);
      throw error;
    }
  }

  async createViews() {
    try {
      // Create views using SQL file
      const fs = require('fs');
      const path = require('path');
      const viewsSQL = fs.readFileSync(path.join(__dirname, '../sql/create_views.sql'), 'utf8');

      await db.query(viewsSQL);
      console.log('✅ 데이터베이스 뷰 생성 완료');
    } catch (error) {
      console.error('❌ 뷰 생성 실패:', error.message);
    }
  }
}

async function runMockSync() {
  console.log('🧪 Mock 정책 동기화 테스트 시작...\n');

  const syncService = new MockPolicySyncService();

  try {
    // 데이터베이스 연결 테스트
    const connected = await syncService.testConnection();
    if (!connected) {
      console.log('💡 PostgreSQL이 실행 중인지 확인하세요.');
      process.exit(1);
    }

    // 뷰 생성
    await syncService.createViews();

    // Mock 정책 데이터 삽입
    console.log('📋 Mock 정책 데이터 삽입 중...');
    const result = await syncService.insertMockPolicies();

    console.log('\n📊 동기화 결과:');
    console.log(`   총 ${result.total}개 정책 처리`);
    console.log(`   신규: ${result.inserted}개`);
    console.log(`   업데이트: ${result.updated}개`);

    console.log('\n✅ Mock 정책 동기화 테스트 성공!');
    console.log('   이제 Flutter 앱에서 정책 데이터를 확인할 수 있습니다.');

  } catch (error) {
    console.error('\n❌ Mock 동기화 테스트 실패:', error.message);
  }

  console.log('\n🏁 테스트 완료');
  process.exit(0);
}

// 직접 실행 시
if (require.main === module) {
  runMockSync();
}

module.exports = MockPolicySyncService;