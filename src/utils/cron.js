const cron = require('node-cron');
const ontongService = require('../services/ontongService');
const db = require('../config/database');

class CronJobs {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * 모든 크론 작업 시작
   */
  start() {
    console.log('🕐 크론 작업 시작...');

    // 매일 새벽 2시에 정책 데이터 전체 동기화
    this.scheduleJob('daily-sync', '0 2 * * *', async () => {
      console.log('📥 일일 정책 동기화 시작');
      try {
        const syncedCount = await ontongService.syncPolicies();
        console.log(`✅ 일일 동기화 완료: ${syncedCount}개 정책`);

        // 성공 로그 저장
        await this.logActivity('daily-sync', 'success', {
          syncedCount,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('❌ 일일 동기화 실패:', error);

        // 실패 로그 저장
        await this.logActivity('daily-sync', 'error', {
          error: error.message,
          timestamp: new Date()
        });
      }
    });

    // 매 시간마다 인기 정책 점수 업데이트
    this.scheduleJob('popularity-update', '0 * * * *', async () => {
      console.log('📊 인기 점수 업데이트 시작');
      try {
        await this.updatePopularityScores();
        console.log('✅ 인기 점수 업데이트 완료');

      } catch (error) {
        console.error('❌ 인기 점수 업데이트 실패:', error);
      }
    });

    // 매일 새벽 3시에 만료된 정책 정리
    this.scheduleJob('cleanup-expired', '0 3 * * *', async () => {
      console.log('🗑️ 만료된 정책 정리 시작');
      try {
        const cleanedCount = await this.cleanupExpiredPolicies();
        console.log(`✅ 만료된 정책 정리 완료: ${cleanedCount}개`);

      } catch (error) {
        console.error('❌ 정책 정리 실패:', error);
      }
    });

    // 매일 새벽 4시에 사용자 추천 데이터 갱신
    this.scheduleJob('refresh-recommendations', '0 4 * * *', async () => {
      console.log('🎯 추천 데이터 갱신 시작');
      try {
        const refreshedCount = await this.refreshUserRecommendations();
        console.log(`✅ 추천 데이터 갱신 완료: ${refreshedCount}명`);

      } catch (error) {
        console.error('❌ 추천 데이터 갱신 실패:', error);
      }
    });

    // 매주 일요일 새벽 1시에 통계 집계
    this.scheduleJob('weekly-stats', '0 1 * * 0', async () => {
      console.log('📈 주간 통계 집계 시작');
      try {
        await this.generateWeeklyStats();
        console.log('✅ 주간 통계 집계 완료');

      } catch (error) {
        console.error('❌ 주간 통계 집계 실패:', error);
      }
    });
  }

  /**
   * 모든 크론 작업 중지
   */
  stop() {
    console.log('⏹️ 크론 작업 중지...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`${name} 작업 중지됨`);
    });
    this.jobs.clear();
  }

  /**
   * 개별 크론 작업 스케줄링
   */
  scheduleJob(name, schedule, task) {
    if (this.jobs.has(name)) {
      console.log(`기존 ${name} 작업 중지`);
      this.jobs.get(name).stop();
    }

    const job = cron.schedule(schedule, task, {
      scheduled: false,
      timezone: 'Asia/Seoul'
    });

    job.start();
    this.jobs.set(name, job);
    console.log(`✅ ${name} 크론 작업 등록됨 (${schedule})`);
  }

  /**
   * 인기 점수 업데이트
   */
  async updatePopularityScores() {
    const query = `
      UPDATE policies SET popularity_score = (
        SELECT
          COALESCE(
            (bookmark_count * 3 + view_count * 1 + click_count * 2) /
            GREATEST(EXTRACT(DAYS FROM (CURRENT_DATE - policies.cached_at::date)) + 1, 1)
          , 0)
        FROM (
          SELECT
            policies.id,
            COALESCE(SUM(CASE WHEN i.action = 'bookmark' THEN 1 ELSE 0 END), 0) as bookmark_count,
            COALESCE(SUM(CASE WHEN i.action = 'view' THEN 1 ELSE 0 END), 0) as view_count,
            COALESCE(SUM(CASE WHEN i.action = 'click' THEN 1 ELSE 0 END), 0) as click_count
          FROM policies
          LEFT JOIN interactions i ON policies.id = i.policy_id
          WHERE i.created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY policies.id
        ) stats
        WHERE stats.id = policies.id
      )
      WHERE status = 'active'
    `;

    const result = await db.query(query);
    return result.rowCount;
  }

  /**
   * 만료된 정책 정리
   */
  async cleanupExpiredPolicies() {
    // 만료된 정책을 inactive 상태로 변경
    const updateQuery = `
      UPDATE policies
      SET status = 'ended', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active'
        AND deadline IS NOT NULL
        AND deadline < CURRENT_DATE
    `;

    const updateResult = await db.query(updateQuery);

    // 90일 이상 된 상호작용 데이터 정리
    const cleanupQuery = `
      DELETE FROM interactions
      WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
    `;

    await db.query(cleanupQuery);

    // 만료된 세션 정리
    const sessionCleanup = `
      DELETE FROM user_sessions
      WHERE expires_at < CURRENT_TIMESTAMP
    `;

    await db.query(sessionCleanup);

    return updateResult.rowCount;
  }

  /**
   * 사용자 추천 데이터 갱신
   */
  async refreshUserRecommendations() {
    // 활성 사용자 목록 조회
    const activeUsersQuery = `
      SELECT DISTINCT u.id
      FROM users u
      JOIN interactions i ON u.id = i.user_id
      WHERE u.is_active = true
        AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;

    const usersResult = await db.query(activeUsersQuery);

    // 기존 추천 데이터 중 7일 이상 된 것들 삭제
    await db.query(`
      DELETE FROM recommendations
      WHERE created_at < CURRENT_DATE - INTERVAL '7 days'
    `);

    return usersResult.rowCount;
  }

  /**
   * 주간 통계 집계
   */
  async generateWeeklyStats() {
    const statsQueries = [
      // 주간 신규 사용자
      `
        INSERT INTO admin_notifications (type, title, message, data)
        SELECT
          'info',
          '주간 신규 사용자 통계',
          CONCAT('지난 주 신규 가입자: ', COUNT(*), '명'),
          json_build_object(
            'week_start', CURRENT_DATE - INTERVAL '7 days',
            'week_end', CURRENT_DATE,
            'new_users', COUNT(*),
            'type', 'weekly_new_users'
          )
        FROM users
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `,

      // 주간 인기 정책
      `
        INSERT INTO admin_notifications (type, title, message, data)
        SELECT
          'info',
          '주간 인기 정책',
          CONCAT('가장 인기있는 정책: ', title),
          json_build_object(
            'policy_id', id,
            'title', title,
            'bookmark_count', bookmark_count,
            'view_count', view_count,
            'type', 'weekly_popular_policy'
          )
        FROM (
          SELECT
            p.id, p.title,
            COUNT(CASE WHEN i.action = 'bookmark' THEN 1 END) as bookmark_count,
            COUNT(CASE WHEN i.action = 'view' THEN 1 END) as view_count
          FROM policies p
          LEFT JOIN interactions i ON p.id = i.policy_id
            AND i.created_at >= CURRENT_DATE - INTERVAL '7 days'
          WHERE p.status = 'active'
          GROUP BY p.id, p.title
          ORDER BY bookmark_count DESC, view_count DESC
          LIMIT 1
        ) top_policy
      `
    ];

    for (const query of statsQueries) {
      try {
        await db.query(query);
      } catch (error) {
        console.error('통계 쿼리 실행 실패:', error);
      }
    }
  }

  /**
   * 활동 로그 저장
   */
  async logActivity(jobName, status, data) {
    try {
      await db.query(
        `INSERT INTO admin_notifications (type, title, message, data, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [
          status === 'success' ? 'info' : 'error',
          `크론 작업: ${jobName}`,
          `${jobName} 작업이 ${status === 'success' ? '성공' : '실패'}했습니다`,
          JSON.stringify({ jobName, status, ...data })
        ]
      );
    } catch (error) {
      console.error('활동 로그 저장 실패:', error);
    }
  }

  /**
   * 수동으로 특정 작업 실행
   */
  async runJobNow(jobName) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`작업 '${jobName}'을 찾을 수 없습니다`);
    }

    console.log(`🔄 수동 실행: ${jobName}`);

    switch (jobName) {
      case 'daily-sync':
        return await ontongService.syncPolicies();
      case 'popularity-update':
        return await this.updatePopularityScores();
      case 'cleanup-expired':
        return await this.cleanupExpiredPolicies();
      case 'refresh-recommendations':
        return await this.refreshUserRecommendations();
      case 'weekly-stats':
        return await this.generateWeeklyStats();
      default:
        throw new Error(`알 수 없는 작업: ${jobName}`);
    }
  }

  /**
   * 작업 상태 조회
   */
  getJobStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        lastDate: job.lastDate,
        nextDate: job.nextDate
      };
    });
    return status;
  }
}

module.exports = new CronJobs();