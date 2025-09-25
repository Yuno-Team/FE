#!/bin/bash

# Yuno Backend 배포 스크립트
# EC2 Amazon Linux 2023 환경에서 실행

set -e  # 에러 발생시 스크립트 중단

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수들
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 환경 변수 확인
check_env() {
    log_info "환경 변수 확인 중..."

    required_vars=(
        "DB_PASSWORD"
        "JWT_SECRET"
        "ONTONG_API_KEY"
    )

    missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "필수 환경 변수가 설정되지 않았습니다:"
        printf '%s\n' "${missing_vars[@]}"
        log_info "환경 변수를 설정한 후 다시 실행해주세요."
        exit 1
    fi

    log_success "모든 필수 환경 변수가 설정되었습니다."
}

# 시스템 업데이트
update_system() {
    log_info "시스템 패키지 업데이트 중..."
    sudo yum update -y
    log_success "시스템 업데이트 완료"
}

# Docker 설치
install_docker() {
    log_info "Docker 설치 확인 중..."

    if command -v docker &> /dev/null; then
        log_success "Docker가 이미 설치되어 있습니다."
    else
        log_info "Docker 설치 중..."
        sudo yum install -y docker
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -a -G docker $USER
        log_success "Docker 설치 완료"
    fi
}

# Docker Compose 설치
install_docker_compose() {
    log_info "Docker Compose 설치 확인 중..."

    if command -v docker-compose &> /dev/null; then
        log_success "Docker Compose가 이미 설치되어 있습니다."
    else
        log_info "Docker Compose 설치 중..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        log_success "Docker Compose 설치 완료"
    fi
}

# Git 설치
install_git() {
    log_info "Git 설치 확인 중..."

    if command -v git &> /dev/null; then
        log_success "Git이 이미 설치되어 있습니다."
    else
        log_info "Git 설치 중..."
        sudo yum install -y git
        log_success "Git 설치 완료"
    fi
}

# 프로젝트 클론 또는 업데이트
setup_project() {
    PROJECT_DIR="/opt/yuno-backend"

    log_info "프로젝트 설정 중..."

    if [ -d "$PROJECT_DIR" ]; then
        log_info "기존 프로젝트 업데이트 중..."
        cd $PROJECT_DIR
        git pull origin main
    else
        log_info "프로젝트 클론 중..."
        sudo mkdir -p /opt
        sudo git clone https://github.com/Yuno-Team/Backend.git $PROJECT_DIR
        sudo chown -R $USER:$USER $PROJECT_DIR
        cd $PROJECT_DIR
    fi

    log_success "프로젝트 설정 완료"
}

# 환경 파일 생성
create_env_file() {
    log_info ".env 파일 생성 중..."

    cat > .env << EOF
# Database
DB_PASSWORD=${DB_PASSWORD}

# JWT
JWT_SECRET=${JWT_SECRET}

# 온통청년 API
ONTONG_API_KEY=${ONTONG_API_KEY}

# 소셜 로그인 (선택적)
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
KAKAO_REST_API_KEY=${KAKAO_REST_API_KEY:-}
NAVER_CLIENT_ID=${NAVER_CLIENT_ID:-}
NAVER_CLIENT_SECRET=${NAVER_CLIENT_SECRET:-}

# 서버 설정
NODE_ENV=production
PORT=3000

# 외부 API 설정
ONTONG_API_BASE_URL=https://www.youthcenter.go.kr/openapi
EOF

    log_success ".env 파일 생성 완료"
}

# SSL 인증서 설정 (Let's Encrypt)
setup_ssl() {
    if [ -n "$DOMAIN_NAME" ]; then
        log_info "SSL 인증서 설정 중..."

        # Certbot 설치
        sudo yum install -y snapd
        sudo systemctl enable --now snapd.socket
        sudo snap install core; sudo snap refresh core
        sudo snap install --classic certbot

        # 인증서 발급
        sudo certbot certonly --standalone -d $DOMAIN_NAME --non-interactive --agree-tos --email admin@$DOMAIN_NAME

        # SSL 파일 복사
        sudo mkdir -p nginx/ssl
        sudo cp /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem nginx/ssl/cert.pem
        sudo cp /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem nginx/ssl/key.pem
        sudo chown -R $USER:$USER nginx/ssl

        log_success "SSL 인증서 설정 완료"
    else
        log_warning "DOMAIN_NAME이 설정되지 않아 SSL 설정을 건너뜁니다."
    fi
}

# 방화벽 설정
setup_firewall() {
    log_info "방화벽 설정 중..."

    # HTTP/HTTPS 포트 열기
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload

    log_success "방화벽 설정 완료"
}

# Docker 컨테이너 시작
start_containers() {
    log_info "Docker 컨테이너 시작 중..."

    # 기존 컨테이너 중지 및 제거
    docker-compose down || true

    # 새 컨테이너 빌드 및 시작
    docker-compose up -d --build

    # 컨테이너 상태 확인
    sleep 10
    if docker-compose ps | grep -q "Up"; then
        log_success "모든 컨테이너가 성공적으로 시작되었습니다."
    else
        log_error "일부 컨테이너 시작에 실패했습니다."
        docker-compose logs
        exit 1
    fi
}

# 헬스 체크
health_check() {
    log_info "서비스 헬스 체크 중..."

    # 최대 30초 대기
    for i in {1..30}; do
        if curl -f http://localhost/health &> /dev/null; then
            log_success "서비스가 정상적으로 작동하고 있습니다."
            return 0
        fi
        sleep 1
    done

    log_error "서비스 헬스 체크 실패"
    docker-compose logs
    exit 1
}

# 로그 확인 함수
show_logs() {
    log_info "최근 로그 확인:"
    docker-compose logs --tail=20
}

# 서비스 정보 출력
show_service_info() {
    log_success "🎉 배포 완료!"
    echo ""
    echo "📋 서비스 정보:"
    echo "  - API URL: http://$(curl -s ifconfig.me)/api"
    echo "  - Health Check: http://$(curl -s ifconfig.me)/health"
    echo ""
    echo "🛠 관리 명령어:"
    echo "  - 로그 확인: docker-compose logs -f"
    echo "  - 서비스 재시작: docker-compose restart"
    echo "  - 서비스 중지: docker-compose down"
    echo "  - 서비스 시작: docker-compose up -d"
    echo ""
    echo "📁 프로젝트 경로: $(pwd)"
}

# 메인 실행 함수
main() {
    log_info "🚀 Yuno Backend 배포를 시작합니다..."

    # 필수 디렉토리로 이동
    cd "$(dirname "$0")/.."

    # 환경 변수 확인
    check_env

    # 시스템 설정
    update_system
    install_docker
    install_docker_compose
    install_git

    # 프로젝트 설정
    setup_project
    create_env_file
    setup_ssl
    setup_firewall

    # 서비스 시작
    start_containers
    health_check

    # 완료 정보 출력
    show_service_info
    show_logs
}

# 도움말 함수
show_help() {
    cat << EOF
Yuno Backend 배포 스크립트

사용법: $0 [옵션]

옵션:
  -h, --help     이 도움말 출력
  --logs         서비스 로그 확인
  --restart      서비스 재시작
  --stop         서비스 중지
  --status       서비스 상태 확인

환경 변수:
  DB_PASSWORD       (필수) 데이터베이스 비밀번호
  JWT_SECRET        (필수) JWT 시크릿 키
  ONTONG_API_KEY    (필수) 온통청년 API 키
  DOMAIN_NAME       (선택) SSL 인증서용 도메인명
  GOOGLE_CLIENT_ID  (선택) 구글 로그인 클라이언트 ID
  KAKAO_REST_API_KEY (선택) 카카오 REST API 키
  NAVER_CLIENT_ID   (선택) 네이버 클라이언트 ID
  NAVER_CLIENT_SECRET (선택) 네이버 클라이언트 시크릿

예시:
  export DB_PASSWORD="your-db-password"
  export JWT_SECRET="your-jwt-secret"
  export ONTONG_API_KEY="your-api-key"
  $0

EOF
}

# 명령행 인수 처리
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --logs)
        docker-compose logs -f
        exit 0
        ;;
    --restart)
        log_info "서비스 재시작 중..."
        docker-compose restart
        health_check
        log_success "서비스 재시작 완료"
        exit 0
        ;;
    --stop)
        log_info "서비스 중지 중..."
        docker-compose down
        log_success "서비스 중지 완료"
        exit 0
        ;;
    --status)
        log_info "서비스 상태:"
        docker-compose ps
        exit 0
        ;;
    "")
        main
        ;;
    *)
        log_error "알 수 없는 옵션: $1"
        show_help
        exit 1
        ;;
esac