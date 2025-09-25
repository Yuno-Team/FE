# Flutter REST API Migration Guide

## Overview
The Yuno Flutter app has been migrated from AWS Amplify to a custom REST API backend running on EC2.

## Key Changes

### 1. Dependencies Updated
**Removed:**
- `amplify_flutter`
- `amplify_auth_cognito`
- `amplify_api`
- `amplify_storage_s3`
- `http` (replaced with dio)

**Added:**
- `dio` - HTTP client for API communication
- `google_sign_in` - Google OAuth authentication
- `kakao_flutter_sdk` - Kakao login integration
- `flutter_naver_login` - Naver login integration
- `sign_in_with_apple` - Apple Sign In (iOS only)

### 2. Service Architecture

#### API Service (`lib/services/api_service.dart`)
- Handles all HTTP communication with the backend
- JWT token management with automatic refresh
- Base URL: `http://52.79.251.242/api`
- Interceptors for authentication and error handling

#### Auth Service (`lib/services/auth_service.dart`)
- Integrates with native social login SDKs
- Manages user authentication state
- Supports Google, Kakao, Naver, and Apple login

#### Policy Service (`lib/services/policy_service.dart`)
- Fetches policy data from REST endpoints
- Handles bookmarking and interaction tracking
- Uses ApiService for all backend communication

### 3. Configuration

#### App Config (`lib/config/app_config.dart`)
Contains all environment-specific constants:
- API base URL
- Social login client IDs and secrets
- Platform-specific configurations

#### Android Configuration
**File:** `android/app/src/main/res/values/strings.xml`
- Kakao app key and scheme
- Naver client credentials

### 4. Authentication Flow

1. User selects social login provider
2. Native SDK handles OAuth flow
3. Access token sent to backend API
4. Backend validates token with provider
5. JWT tokens returned and stored locally
6. Automatic token refresh on API calls

### 5. API Endpoints Used

**Authentication:**
- `POST /api/auth/social-login` - Social login
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/verify` - Token verification
- `POST /api/auth/logout` - Logout

**Policies:**
- `GET /api/policies` - Policy list with filters
- `GET /api/policies/:id` - Policy details
- `GET /api/policies/lists/popular` - Popular policies
- `GET /api/policies/lists/deadline` - Deadline approaching
- `GET /api/policies/lists/recommendations` - AI recommendations

**Users:**
- `GET /api/users/me` - User profile
- `PUT /api/users/me` - Update profile
- `GET /api/users/me/bookmarks` - User bookmarks
- `POST /api/users/me/bookmarks` - Add bookmark

## Setup Instructions

### 1. Install Dependencies
```bash
flutter pub get
```

### 2. Configure Social Login

#### Google Sign-In
1. Add your app to Firebase Console
2. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
3. Update client IDs in `app_config.dart`

#### Kakao Login
1. Register app at Kakao Developers
2. Update keys in `app_config.dart` and `strings.xml`
3. Add URL scheme to AndroidManifest.xml and Info.plist

#### Naver Login
1. Register app at Naver Developers
2. Update credentials in `app_config.dart` and `strings.xml`

#### Apple Sign In (iOS only)
1. Enable Apple Sign In in Apple Developer Console
2. Update bundle ID in `app_config.dart`

### 3. Build and Run
```bash
# Android
flutter run -d android

# iOS
flutter run -d ios
```

## Migration Benefits

1. **Cost Reduction**: ~$105/month savings (Amplify $140 → EC2 $35)
2. **Full Control**: Complete control over backend logic and data
3. **Real-time Data**: Direct integration with Ontong Youth API
4. **Scalability**: Can easily scale EC2 instance as needed
5. **Monitoring**: Full access to logs and metrics

## Next Steps

1. Configure social login credentials
2. Test authentication flows
3. Implement push notifications (optional)
4. Add analytics tracking
5. Setup CI/CD pipeline for deployments