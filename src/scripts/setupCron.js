#!/usr/bin/env node

const cron = require('node-cron');
const PolicySyncService = require('./syncPolicies');

/**
 * 정책 동기화 크론잡 설정
 */
class PolicyCronManager {
  constructor() {
    this.syncService = new PolicySyncService();
    this.jobs = new Map();
  }

  /**
   * 모든 크론잡 시작
   */
  startAll() {
    this.setupDailySync();
    this.setupHealthCheck();

    console.log('🕐 모든 크론잡이 시작되었습니다.');
    console.log('   - 정책 동기화: 매일 새벽 3시');
    console.log('   - 헬스체크: 매시 정각');
  }

  /**
   * 매일 새벽 3시에 정책 동기화
   */
  setupDailySync() {
    const job = cron.schedule('0 3 * * *', async () => {
      console.log('\n🚀 정책 동기화 크론잡 시작:', new Date().toISOString());

      try {
        await this.syncService.syncAllPolicies();
        console.log('✅ 정책 동기화 크론잡 완료');
      } catch (error) {
        console.error('❌ 정책 동기화 크론잡 실패:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Seoul'
    });

    this.jobs.set('dailySync', job);
    job.start();

    console.log('✅ 일일 정책 동기화 크론잡 등록 완료');
  }

  /**
   * 매시간 헬스체크 (선택사항)
   */
  setupHealthCheck() {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        // 간단한 DB 연결 체크
        const db = require('../config/database');
        await db.query('SELECT 1');

        console.log(`🔍 헬스체크 통과: ${new Date().toISOString()}`);
      } catch (error) {
        console.error('❌ 헬스체크 실패:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Seoul'
    });

    this.jobs.set('healthCheck', job);
    job.start();

    console.log('✅ 헬스체크 크론잡 등록 완료');
  }

  /**
   * 특정 크론잡 중지
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      console.log(`⏹️  크론잡 중지됨: ${jobName}`);
    }
  }

  /**
   * 모든 크론잡 중지
   */
  stopAll() {
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️  크론잡 중지됨: ${name}`);
    });

    console.log('🛑 모든 크론잡이 중지되었습니다.');
  }

  /**
   * 수동으로 정책 동기화 실행
   */
  async runSyncNow() {
    console.log('🚀 수동 정책 동기화 시작...');
    try {
      await this.syncService.syncAllPolicies();
      console.log('✅ 수동 정책 동기화 완료');
      return true;
    } catch (error) {
      console.error('❌ 수동 정책 동기화 실패:', error);
      return false;
    }
  }

  /**
   * 크론잡 상태 확인
   */
  getStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.scheduled,
        nextRun: job.nextDates ? job.nextDates().toISOString() : null
      };
    });

    return status;
  }
}

// 직접 실행 시
if (require.main === module) {
  const cronManager = new PolicyCronManager();

  // 프로세스 종료 시 정리
  process.on('SIGINT', () => {
    console.log('\n🛑 프로세스 종료 요청 받음...');
    cronManager.stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 프로세스 종료 요청 받음...');
    cronManager.stopAll();
    process.exit(0);
  });

  // 크론잡 시작
  cronManager.startAll();

  // 프로세스 유지
  console.log('✅ 크론 매니저가 실행 중입니다. Ctrl+C로 종료하세요.');
}

module.exports = PolicyCronManager;