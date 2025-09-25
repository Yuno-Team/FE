const { Pool } = require('pg');

// DB 직접 연결 (호스트에서 실행)
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'yuno',
  user: 'yuno',
  password: 'simplepass',
  ssl: false
});

async function syncPolicies() {
  console.log('정책 동기화 시작...');
  
  // 테스트 데이터
  const mockPolicies = [
    {
      id: 'R202400001',
      title: '청년 창업 지원사업',
      category: '창업지원',
      description: '창업을 희망하는 청년들을 위한 자금 지원 및 멘토링 프로그램',
      content: '창업 아이디어가 있는 만 18-39세 청년을 대상으로 초기 자금 지원',
      deadline: '2024-12-31',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      application_url: 'https://www.k-startup.go.kr',
      requirements: ['만 18-39세', '창업 아이디어 보유'],
      benefits: ['최대 5천만원 지원', '멘토링'],
      region: ['전국'],
      target_age: { min: 18, max: 39 },
      view_count: 1200,
      status: 'active'
    },
    {
      id: 'R202400002',
      title: '대학생 국가장학금',
      category: '장학금',
      description: '경제적 여건에 관계없이 고등교육 기회 제공',
      content: '소득분위 8분위 이하 대학생 등록금 지원',
      deadline: '2024-11-30',
      start_date: '2024-03-01',
      end_date: '2024-11-30',
      application_url: 'https://www.kosaf.go.kr',
      requirements: ['대학 재학생', '소득 8분위 이하'],
      benefits: ['등록금 전액/일부'],
      region: ['전국'],
      target_age: { min: 18, max: 35 },
      view_count: 2800,
      status: 'active'
    },
    {
      id: 'R202400003',
      title: '청년 주거 지원',
      category: '주거지원',
      description: '청년 주거비 부담 완화',
      content: '무주택 청년 월세 및 전세자금 지원',
      deadline: '2024-12-31',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      application_url: 'https://www.lh.or.kr',
      requirements: ['만 19-39세', '무주택자'],
      benefits: ['월세 20만원', '전세자금 1억'],
      region: ['서울', '경기'],
      target_age: { min: 19, max: 39 },
      view_count: 1500,
      status: 'active'
    }
  ];

  for (const policy of mockPolicies) {
    try {
      const query = `
        INSERT INTO policies (
          id, title, category, description, content, deadline,
          start_date, end_date, application_url, requirements,
          benefits, region, target_age, view_count, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await pool.query(query, [
        policy.id,
        policy.title,
        policy.category,
        policy.description,
        policy.content,
        policy.deadline,
        policy.start_date,
        policy.end_date,
        policy.application_url,
        JSON.stringify(policy.requirements),
        JSON.stringify(policy.benefits),
        JSON.stringify(policy.region),
        JSON.stringify(policy.target_age),
        policy.view_count,
        policy.status
      ]);
      
      console.log(`✅ ${policy.title} 저장됨`);
    } catch (error) {
      console.error(`❌ ${policy.title} 저장 실패:`, error.message);
    }
  }
  
  const result = await pool.query('SELECT COUNT(*) FROM policies');
  console.log(`총 ${result.rows[0].count}개 정책 저장됨`);
  
  await pool.end();
}

syncPolicies().catch(console.error);
