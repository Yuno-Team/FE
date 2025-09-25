#!/usr/bin/env node

/**
 * API 엔드포인트 테스트 스크립트
 */

const axios = require('axios');

const API_BASE_URL = 'http://43.200.164.71:3000/api';

async function testEndpoints() {
  console.log('🧪 API 엔드포인트 테스트 시작...\n');

  const endpoints = [
    { name: '인기 정책', path: '/policies/lists/popular' },
    { name: '마감 임박 정책', path: '/policies/lists/deadline' },
    { name: '일반 정책 목록', path: '/policies' }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`📋 ${endpoint.name} 테스트 중...`);

      const response = await axios.get(`${API_BASE_URL}${endpoint.path}`, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        const data = response.data;
        const policies = data.data?.policies || [];

        console.log(`   ✅ ${endpoint.name}: ${response.status}`);
        console.log(`   📊 반환된 정책 수: ${policies.length}개`);

        if (policies.length > 0) {
          const firstPolicy = policies[0];
          console.log(`   📄 첫 번째 정책: ${firstPolicy.title || firstPolicy.plcyNm || 'N/A'}`);
          console.log(`   🏷️  카테고리: ${firstPolicy.category || firstPolicy.bscPlanPlcyWayNoNm || 'N/A'}`);
        }
      }

    } catch (error) {
      console.log(`   ❌ ${endpoint.name}: ${error.response?.status || 'CONNECTION_ERROR'}`);

      if (error.response?.data) {
        console.log(`   💬 오류 메시지: ${error.response.data.message || error.response.data.error || 'Unknown error'}`);
      } else {
        console.log(`   💬 네트워크 오류: ${error.message}`);
      }
    }

    console.log('');
  }

  // 추천 정책 테스트는 인증이 필요하므로 별도 처리
  console.log('📋 추천 정책 테스트 (인증 필요)...');
  try {
    const response = await axios.get(`${API_BASE_URL}/policies/lists/recommendations`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
        // Authorization: 'Bearer <token>' // 실제로는 토큰이 필요
      }
    });

    console.log(`   ✅ 추천 정책: ${response.status}`);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log(`   ⚠️  추천 정책: 401 (인증 필요) - 정상 동작`);
    } else {
      console.log(`   ❌ 추천 정책: ${error.response?.status || 'CONNECTION_ERROR'}`);
    }
  }

  console.log('\n🏁 API 엔드포인트 테스트 완료');
}

testEndpoints().catch(console.error);