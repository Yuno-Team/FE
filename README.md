# Yuno Backend

AI 기반 청년 정책 추천 서비스 백엔드 API

## 🎯 주요 기능

- **소셜 로그인**: Google, Kakao, Naver 로그인 지원
- **정책 데이터**: 온통청년 API 연동으로 실시간 정책 정보 제공
- **AI 추천**: 사용자 프로필 기반 맞춤형 정책 추천
- **북마크**: 관심 정책 저장 및 관리
- **통계**: 사용자 활동 분석 및 통계 제공

## 🏗 아키텍처

```
Flutter App
     ↓
Nginx (Reverse Proxy)
     ↓
Node.js Express API
     ↓
PostgreSQL Database
     ↓
온통청년 API
```

## 🛠 기술 스택

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **Authentication**: JWT
- **Container**: Docker & Docker Compose
- **Proxy**: Nginx
- **External API**: 온통청년 청년정책 API

## 📋 API 엔드포인트

### 인증 (Authentication)
```
POST /api/auth/social-login     # 소셜 로그인
POST /api/auth/refresh          # 토큰 갱신
GET  /api/auth/verify           # 토큰 검증
POST /api/auth/logout           # 로그아웃
POST /api/auth/logout-all       # 모든 기기에서 로그아웃
DELETE /api/auth/account        # 계정 삭제
```

소셜 로그인 요청 본문 예시
```
POST /api/auth/social-login
Content-Type: application/json

// Google (accessToken 또는 idToken 중 하나 전달)
{
  "provider": "google",
  "accessToken": "ya29.a0AfH6S..." // 또는 "idToken": "<jwt>"
}

// Apple (idToken 필수)
{
  "provider": "apple",
  "idToken": "<apple-identity-token>"
}

// Kakao, Naver (accessToken 필수)
{
  "provider": "kakao",
  "accessToken": "<kakao-access-token>"
}
```

### 정책 (Policies)
```
GET  /api/policies                    # 정책 목록
GET  /api/policies/:id                # 정책 상세
GET  /api/policies/lists/popular      # 인기 정책
GET  /api/policies/lists/deadline     # 마감 임박 정책
GET  /api/policies/lists/recommendations # AI 추천 정책
POST /api/policies/:id/interact       # 정책 상호작용 기록
```

### 사용자 (Users)
```
GET  /api/users/me                    # 내 프로필 조회
PUT  /api/users/me                    # 프로필 수정
GET  /api/users/me/bookmarks          # 북마크 목록
POST /api/users/me/bookmarks          # 북마크 추가
DELETE /api/users/me/bookmarks/:id    # 북마크 삭제
GET  /api/users/me/stats              # 활동 통계
GET  /api/users/me/recommendations    # 추천 기록
```

## 🚀 로컬 개발 환경 설정

### 1. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일에 필요한 값들 입력
```

### 2. Docker로 실행
```bash
docker-compose up -d --build
```

### 3. 개발 모드 실행
```bash
npm install
npm run dev
```

참고: 컨테이너 빌드 시 Dockerfile은 `npm install --omit=dev`를 사용합니다.
`package-lock.json` 없이도 빌드가 가능합니다.

## 🌐 프로덕션 배포

### EC2 인스턴스에서 배포

1. **환경 변수 설정**
```bash
export DB_PASSWORD="your-secure-password"
export JWT_SECRET="your-jwt-secret-key"
export ONTONG_API_KEY="your-ontong-api-key"
export DOMAIN_NAME="your-domain.com"  # SSL용 (선택)
```

2. **배포 실행**
```bash
curl -fsSL https://raw.githubusercontent.com/Yuno-Team/Backend/main/scripts/deploy.sh | bash
```

또는 수동 배포:
```bash
git clone https://github.com/Yuno-Team/Backend.git
cd Backend
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 배포 후 관리

```bash
# 서비스 상태 확인
./scripts/deploy.sh --status

# 로그 확인
./scripts/deploy.sh --logs

# 서비스 재시작
./scripts/deploy.sh --restart

# 서비스 중지
./scripts/deploy.sh --stop
```

## 🗃 데이터베이스 스키마

### 주요 테이블

- **users**: 사용자 정보
- **policies**: 정책 데이터 (온통청년 API 캐시)
- **bookmarks**: 사용자 북마크
- **interactions**: 사용자 행동 로그
- **user_sessions**: 세션 관리
- **recommendations**: AI 추천 기록

## 🔧 환경 변수

### 필수 변수
- `DB_PASSWORD`: PostgreSQL 비밀번호
- `JWT_SECRET`: JWT 토큰 서명용 시크릿 키
- `ONTONG_API_KEY`: 온통청년 API 키
 - `APPLE_CLIENT_ID`: Apple 로그인 검증용 클라이언트 ID (Service ID 또는 앱 번들 ID)

### 선택 변수
- `GOOGLE_CLIENT_ID`: Google 소셜 로그인
- `KAKAO_REST_API_KEY`: Kakao 소셜 로그인
- `NAVER_CLIENT_ID`: Naver 소셜 로그인
- `NAVER_CLIENT_SECRET`: Naver 소셜 로그인
- `DOMAIN_NAME`: SSL 인증서용 도메인

## 📊 모니터링

### 헬스 체크
```bash
curl http://your-server/health
```

### 로그 확인
```bash
docker-compose logs -f app
docker-compose logs -f postgres
docker-compose logs -f nginx
```

### 데이터베이스 백업
```bash
docker-compose exec postgres pg_dump -U yuno yuno > backup.sql
```

## 🔄 크론 작업

자동으로 실행되는 작업들:
- **매일 02:00**: 온통청년 API 정책 데이터 동기화
- **매시간**: 인기 정책 점수 업데이트
- **매일 03:00**: 만료된 정책 및 세션 정리
- **매일 04:00**: 사용자 추천 데이터 갱신
- **주간**: 통계 데이터 집계

## 🐛 트러블슈팅

### 컨테이너 시작 실패
```bash
docker-compose logs
docker-compose down
docker-compose up -d --build
```

### 데이터베이스 연결 실패
```bash
# 데이터베이스 상태 확인
docker-compose exec postgres pg_isready -U yuno

# 데이터베이스 재시작
docker-compose restart postgres
```

### 정책 동기화 실패
```bash
# 수동 동기화 실행
curl -X POST http://localhost/api/admin/sync-policies \
  -H "X-API-Key: your-api-key"
```

## 📝 개발 가이드

### 새로운 API 엔드포인트 추가

1. `src/routes/` 에 라우트 파일 생성
2. `src/controllers/` 에 컨트롤러 로직 구현
3. `src/services/` 에 비즈니스 로직 구현
4. 필요시 `src/middleware/` 에 미들웨어 추가

### 데이터베이스 마이그레이션

1. `sql/` 폴더에 마이그레이션 SQL 파일 생성
2. `src/utils/migrate.js` 에 마이그레이션 로직 추가
3. 배포시 자동 실행

## 🔒 보안

- JWT 토큰 기반 인증
- bcrypt 패스워드 해싱
- Helmet.js 보안 헤더
- Rate Limiting
- CORS 설정
- 환경변수로 민감 정보 관리

## 📄 라이선스

MIT License

## 👥 개발팀

- **Backend Developer**: Yuno Team
- **Repository**: https://github.com/Yuno-Team/Backend

## 📞 지원

- 이슈 리포트: GitHub Issues
- 문의: admin@yuno.app
