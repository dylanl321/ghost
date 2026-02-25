# Token Expiration Security Fix

## Problem
The application was not properly validating Entra ID token expiration on the server side. This meant that users could continue making API requests with expired tokens as long as their session was valid (up to 24 hours), even though the Entra ID access token typically expires after 1 hour.

## Solution
Implemented server-side token expiration validation to ensure expired tokens are rejected immediately.

## Changes Made

### 1. Server-Side Token Validation (`server/utils/entra/session.ts`)
- Added `isTokenExpired()` function to validate JWT `exp` claim
- Modified `getUserSession()` to check token expiration for both:
  - Bearer tokens from Authorization header
  - Access tokens from OIDC sessions
- Returns `null` if token is expired, forcing reauthentication

### 2. OIDC Configuration (`nuxt.config.ts`)
- Enabled `expirationCheck: true` - Automatic expiration checking
- Enabled `automaticRefresh: true` - Automatic token refresh before expiration
- Reduced `maxAge` from 24 hours to 2 hours to align with token refresh patterns
- Kept `expirationThreshold: 300` (5 minutes) for early refresh

## How It Works

1. **On every API request**, the server middleware calls `getUserSession()`
2. `getUserSession()` extracts the access token and validates its expiration
3. If the token is expired:
   - Server returns `null` from `getUserSession()`
   - Auth middleware returns 401 Unauthorized
   - Client is redirected to reauthenticate
4. If the token is near expiration (within 5 minutes):
   - nuxt-oidc-auth automatically refreshes it using the refresh token
   - User continues working without interruption

## Security Benefits

- **Expired tokens are immediately rejected** - No grace period for expired credentials
- **Reduced attack window** - Stolen tokens are only valid until expiration
- **Automatic refresh** - Users don't experience unnecessary logouts
- **Defense in depth** - Both client and server validate expiration

## Testing

To test the fix:

1. Log in to the application
2. Wait for the token to expire (typically 1 hour for Entra ID)
3. Make an API request
4. Expected: User is redirected to reauthenticate
5. After reauthentication, user can continue working

## Notes

- The client-side middleware (`app/middleware/auth-redirect.global.ts`) already had token expiration checking
- This fix adds the critical server-side validation that was missing
- Development mode bypass still works for local testing
