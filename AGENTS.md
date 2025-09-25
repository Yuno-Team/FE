Scope
- Applies to the entire repository and all agents/tools.

Monorepo Policy (EC2 + Flutter)
- Single repo contains both Flutter app and EC2-based Node.js backend.
- Backend deployed on AWS EC2 t3.medium with Docker containers.
- Frontend communicates via REST API endpoints.

Architecture Overview
- **Server**: AWS EC2 t3.medium (ap-northeast-2)
- **Database**: PostgreSQL 15 in Docker container
- **API Server**: Node.js 20 + Express.js in Docker
- **Proxy**: Nginx reverse proxy with SSL support
- **API Base URL**: http://52.79.251.242/api

Ownership Boundaries
- Backend (BE)
  - Owns: `backend/**`, deployment scripts, database migrations
  - Manages: REST API endpoints, authentication, policy data sync
- Frontend (FE)
  - Owns: `lib/**` app code (UI/UX, state, screens, services)
  - Uses: HTTP client for REST API calls, JWT token management

Backend Structure
```
backend/
├── src/
│   ├── app.js              # Main Express server
│   ├── routes/             # API route definitions
│   ├── controllers/        # Business logic handlers
│   ├── services/           # External services (auth, ontong)
│   ├── middleware/         # Custom middleware
│   └── utils/              # Database utilities
├── sql/
│   └── init.sql            # Database schema
├── scripts/
│   └── deploy.sh           # EC2 deployment script
├── docker-compose.yml      # Container orchestration
├── Dockerfile              # Node.js app container
└── nginx/
    └── nginx.conf          # Proxy configuration
```

Key REST API Endpoints
- **Authentication**
  - `POST /api/auth/social-login` - Social login (Google, Kakao, Naver, Apple)
  - `POST /api/auth/refresh` - JWT token refresh
  - `GET /api/auth/verify` - Token verification
  - `POST /api/auth/logout` - Logout user
- **Policies**
  - `GET /api/policies` - Policy list with filters
  - `GET /api/policies/:id` - Policy details
  - `GET /api/policies/lists/popular` - Popular policies
  - `GET /api/policies/lists/deadline` - Deadline approaching
  - `GET /api/policies/lists/recommendations` - AI recommendations
- **Users**
  - `GET /api/users/me` - User profile
  - `PUT /api/users/me` - Update profile
  - `GET /api/users/me/bookmarks` - User bookmarks
  - `POST /api/users/me/bookmarks` - Add bookmark

Environment Variables (Production)
- `DB_PASSWORD`: PostgreSQL password
- `JWT_SECRET`: JWT signing secret
- `ONTONG_API_KEY`: Ontong API key (do NOT commit real values)
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `KAKAO_REST_API_KEY`: Kakao REST API key
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`: Naver OAuth
- `APPLE_CLIENT_ID`: Apple Sign In client ID

Database Schema
- **users**: User profiles and auth data
- **policies**: Cached policy data from Ontong API
- **bookmarks**: User saved policies
- **interactions**: User behavior tracking
- **user_sessions**: JWT session management
- **recommendations**: AI recommendation history

Automated Tasks (Cron Jobs)
- **Daily 02:00**: Sync policies from Ontong API
- **Hourly**: Update popular policy rankings
- **Daily 03:00**: Clean expired sessions and policies
- **Daily 04:00**: Generate user recommendations
- **Weekly**: Aggregate statistics

Deployment Workflow
1) **Local Development**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with local values
   docker-compose up -d --build
   npm run dev
   ```

2) **Production Deployment**
   ```bash
   # On EC2 instance
   export DB_PASSWORD="YunoSecure2024Pass"
   export JWT_SECRET="your-jwt-secret"
   export ONTONG_API_KEY="ad635a05-453c-41a0-9d93-78bcd8de81bf"
   curl -fsSL https://raw.githubusercontent.com/Yuno-Team/Backend/main/scripts/deploy.sh | bash
   ```

3) **Service Management**
   ```bash
   ./scripts/deploy.sh --status    # Check status
   ./scripts/deploy.sh --logs      # View logs
   ./scripts/deploy.sh --restart   # Restart services
   ```

Flutter Integration
- Remove Amplify dependencies and code
- Replace with HTTP client (dio/http)
- Implement JWT token management
- Add social login SDKs for each provider
- Update state management to use REST API

Social Login Configuration
- **Google**: OAuth 2.0 with Google Sign-In SDK
- **Kakao**: Kakao SDK with REST API key
- **Naver**: NaverID SDK with client credentials
- **Apple**: Sign in with Apple (iOS native)

Security Measures
- JWT-based authentication with refresh tokens
- bcrypt password hashing (for future email auth)
- Helmet.js security headers
- CORS configuration
- Rate limiting per IP
- Input validation with express-validator

Cost Optimization
- **Monthly Cost**: ~$35 (EC2 t3.medium + storage)
- **vs Amplify**: $140+ monthly savings
- **Free Tier**: PostgreSQL, Node.js containers
- **Scalable**: Can upgrade instance as needed

Monitoring & Health Checks
- **Health Endpoint**: `GET /health`
- **Container Logs**: `docker-compose logs -f`
- **Database Backup**: `pg_dump` scheduled backups
- **Uptime Monitoring**: External service recommended

Agent/Automation Guidance
- Agents should only modify files under their ownership boundaries
- Always test API endpoints after backend changes
- Update API documentation when adding new endpoints
- Follow RESTful conventions for new endpoints

Troubleshooting Quick Tips
- **503 Service Unavailable**: Check Docker containers with `docker-compose ps`
- **Database Connection**: Verify PostgreSQL health with `pg_isready`
- **Authentication Errors**: Check JWT secret and token expiration
- **Policy Sync Issues**: Verify Ontong API key and network access

References
- See `docs/amplify-monorepo-setup.md` for step-by-step setup and troubleshooting.
