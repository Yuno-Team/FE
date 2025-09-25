const axios = require('axios');
const cheerio = require('cheerio');

/**
 * LH공사 주택 정보 수집 서비스
 */
class LHService {
  constructor() {
    this.publicDataApiKey = process.env.PUBLIC_DATA_API_KEY; // 공공데이터포털 API 키
    this.lhApplyUrl = 'https://apply.lh.or.kr';
    this.myHomeUrl = 'https://www.myhome.go.kr';

    this.client = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  /**
   * 공공데이터포털 - LH 임대주택 정보 조회
   */
  async getPublicRentalHousing(params = {}) {
    try {
      const response = await this.client.get('https://api.odcloud.kr/api/15058476/v1/uddi:64b8ecaa-cb49-456b-a4a7-73c87b60f7c9', {
        params: {
          serviceKey: this.publicDataApiKey,
          page: params.page || 1,
          perPage: params.perPage || 100,
          ...params
        }
      });

      return {
        success: true,
        data: response.data.data || [],
        totalCount: response.data.totalCount || 0
      };
    } catch (error) {
      console.error('LH 공공임대주택 API 오류:', error.message);
      return { success: false, data: [], error: error.message };
    }
  }

  /**
   * LH청약플러스 - 임대주택 공고문 크롤링
   */
  async getLHRentalNotices() {
    try {
      const response = await this.client.get(`${this.lhApplyUrl}/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026`);
      const $ = cheerio.load(response.data);

      const notices = [];

      // 공고문 리스트 파싱
      $('.board-list tbody tr').each((index, element) => {
        const $row = $(element);
        const title = $row.find('td:nth-child(2) a').text().trim();
        const region = $row.find('td:nth-child(3)').text().trim();
        const dateRange = $row.find('td:nth-child(4)').text().trim();
        const link = $row.find('td:nth-child(2) a').attr('href');

        if (title && title !== '') {
          notices.push({
            title,
            region,
            dateRange,
            link: link ? `${this.lhApplyUrl}${link}` : null,
            source: 'LH청약플러스',
            category: '임대주택',
            crawledAt: new Date()
          });
        }
      });

      return {
        success: true,
        data: notices,
        count: notices.length
      };
    } catch (error) {
      console.error('LH 공고문 크롤링 오류:', error.message);
      return { success: false, data: [], error: error.message };
    }
  }

  /**
   * 마이홈포털 - 임대주택 입주자 모집공고
   */
  async getMyHomeNotices() {
    try {
      const response = await this.client.get(`${this.myHomeUrl}/hws/portal/sch/selectRsdtRcritNtcView.do`);
      const $ = cheerio.load(response.data);

      const notices = [];

      // 공고 리스트 파싱
      $('.tbl-basic tbody tr').each((index, element) => {
        const $row = $(element);
        const title = $row.find('td:first-child a').text().trim();
        const company = $row.find('td:nth-child(2)').text().trim();
        const region = $row.find('td:nth-child(3)').text().trim();
        const period = $row.find('td:nth-child(4)').text().trim();
        const link = $row.find('td:first-child a').attr('href');

        if (title && title !== '') {
          notices.push({
            title,
            company,
            region,
            period,
            link: link ? `${this.myHomeUrl}${link}` : null,
            source: '마이홈포털',
            category: '임대주택',
            crawledAt: new Date()
          });
        }
      });

      return {
        success: true,
        data: notices,
        count: notices.length
      };
    } catch (error) {
      console.error('마이홈포털 크롤링 오류:', error.message);
      return { success: false, data: [], error: error.message };
    }
  }

  /**
   * 청년 전용 주택 정보 필터링
   */
  filterYouthHousing(notices) {
    const youthKeywords = [
      '청년', '신혼', '대학생', '사회초년생',
      '청년전용', '청년우선', '신혼부부',
      '대학생전용', '사회초년생전용'
    ];

    return notices.filter(notice => {
      const title = notice.title.toLowerCase();
      return youthKeywords.some(keyword =>
        title.includes(keyword) || title.includes(keyword.toLowerCase())
      );
    });
  }

  /**
   * 모든 LH 관련 정보 통합 조회
   */
  async getAllLHNotices() {
    try {
      console.log('🏠 LH 주택 정보 수집 시작...');

      const results = await Promise.allSettled([
        this.getLHRentalNotices(),
        this.getMyHomeNotices(),
        this.getPublicRentalHousing()
      ]);

      let allNotices = [];
      let errors = [];

      // LH청약플러스 결과
      if (results[0].status === 'fulfilled' && results[0].value.success) {
        allNotices = [...allNotices, ...results[0].value.data];
        console.log(`✅ LH청약플러스: ${results[0].value.data.length}개`);
      } else {
        errors.push('LH청약플러스 수집 실패');
      }

      // 마이홈포털 결과
      if (results[1].status === 'fulfilled' && results[1].value.success) {
        allNotices = [...allNotices, ...results[1].value.data];
        console.log(`✅ 마이홈포털: ${results[1].value.data.length}개`);
      } else {
        errors.push('마이홈포털 수집 실패');
      }

      // 공공데이터포털 결과
      if (results[2].status === 'fulfilled' && results[2].value.success) {
        const publicData = results[2].value.data.map(item => ({
          title: `${item.단지명} (${item.임대유형})`,
          region: item.주소,
          company: 'LH공사',
          source: '공공데이터포털',
          category: '임대주택',
          details: item,
          crawledAt: new Date()
        }));
        allNotices = [...allNotices, ...publicData];
        console.log(`✅ 공공데이터포털: ${publicData.length}개`);
      } else {
        errors.push('공공데이터포털 수집 실패');
      }

      // 청년 관련 주택만 필터링
      const youthNotices = this.filterYouthHousing(allNotices);

      return {
        success: true,
        data: {
          all: allNotices,
          youth: youthNotices,
          total: allNotices.length,
          youthTotal: youthNotices.length
        },
        errors: errors.length > 0 ? errors : null
      };

    } catch (error) {
      console.error('LH 정보 통합 수집 오류:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = LHService;