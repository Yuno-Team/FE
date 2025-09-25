#!/usr/bin/env node

/**
 * 정책 동기화 테스트 스크립트
 */

const PolicySyncService = require('./src/scripts/syncPolicies');

async function testSync() {
  console.log('🧪 정책 동기화 테스트 시작...\n');

  const syncService = new PolicySyncService();

  try {
    // 일부 정책만 동기화해서 테스트
    console.log('📋 장학금 카테고리 동기화 테스트...');
    const result = await syncService.syncCategoryPolicies('장학금', 1);

    console.log('\n📊 동기화 결과:');
    console.log(`   총 ${result.total}개 정책 처리`);
    console.log(`   신규: ${result.inserted}개`);
    console.log(`   업데이트: ${result.updated}개`);

    if (result.total > 0) {
      console.log('\n✅ 정책 동기화 테스트 성공!');
      console.log('   데이터베이스 우선 조회 방식이 정상 작동할 것입니다.');
    } else {
      console.log('\n⚠️  정책 데이터를 가져오지 못했습니다.');
      console.log('   API 키 또는 네트워크 연결을 확인하세요.');
    }

  } catch (error) {
    console.error('\n❌ 동기화 테스트 실패:', error.message);

    if (error.message.includes('getaddrinfo')) {
      console.log('   💡 네트워크 연결을 확인하세요.');
    } else if (error.message.includes('API')) {
      console.log('   💡 온통청년 API 키를 확인하세요.');
    }
  }

  console.log('\n🏁 테스트 완료');
  process.exit(0);
}

testSync();