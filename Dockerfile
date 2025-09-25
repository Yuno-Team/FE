FROM node:20-alpine

WORKDIR /app

# 의존성 파일 복사 및 설치
COPY package*.json ./
# Use npm install to avoid lockfile requirement in CI/build contexts
RUN npm install --omit=dev

# 애플리케이션 코드 복사
COPY src/ ./src/

# 업로드 디렉토리 생성
RUN mkdir -p uploads

# 비 루트 사용자 생성
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 권한 설정
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

CMD ["node", "src/app.js"]
