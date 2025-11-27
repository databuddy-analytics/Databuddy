# @databuddy/auth

Authentication and authorization package for Databuddy, built on [Better Auth](https://better-auth.com/).

## Overview

This package provides:
- User authentication (email/password, OAuth, magic links)
- Session management
- Role-based access control (RBAC)
- Multi-factor authentication (2FA)
- Organization and team management
- Permission system

## Features

- **Email/Password Authentication**: Traditional login with secure password hashing
- **OAuth Providers**: Google, GitHub authentication
- **Magic Links**: Passwordless authentication via email
- **Email OTP**: One-time password authentication
- **Two-Factor Authentication**: Optional 2FA for enhanced security
- **Organization Support**: Multi-tenant organizations with roles
- **Session Management**: Secure session handling with Redis
- **Custom Permissions**: Fine-grained permission system

## Installation

This package is internal to the Databuddy monorepo and is not published to NPM.

```bash
# Within the monorepo
bun install
```

## Usage

### Server-Side (API/Dashboard)

```typescript
import { auth } from '@databuddy/auth'

// Get current user session
const session = await auth.api.getSession({
  headers: request.headers,
})

if (!session) {
  return new Response('Unauthorized', { status: 401 })
}

console.log(session.user) // User object
console.log(session.session) // Session object
```

### Client-Side (React)

```typescript
import { authClient } from '@databuddy/auth/client'

// Sign in with email/password
await authClient.signIn.email({
  email: 'user@example.com',
  password: 'secure-password',
})

// Sign in with OAuth
await authClient.signIn.social({
  provider: 'google',
  callbackURL: '/dashboard',
})

// Sign out
await authClient.signOut()

// Get current session
const session = authClient.useSession()
```

## Authentication Methods

### Email/Password

```typescript
// Sign up
await authClient.signUp.email({
  email: 'user@example.com',
  password: 'secure-password',
  name: 'John Doe',
})

// Sign in
await authClient.signIn.email({
  email: 'user@example.com',
  password: 'secure-password',
})
```

### OAuth (Google, GitHub)

```typescript
// Sign in with Google
await authClient.signIn.social({
  provider: 'google',
  callbackURL: '/dashboard',
})

// Sign in with GitHub
await authClient.signIn.social({
  provider: 'github',
  callbackURL: '/dashboard',
})
```

### Magic Link

```typescript
// Send magic link email
await authClient.signIn.magicLink({
  email: 'user@example.com',
  callbackURL: '/dashboard',
})

// User clicks link in email, automatically signed in
```

### Email OTP

```typescript
// Send OTP code
await authClient.signIn.otp.send({
  email: 'user@example.com',
})

// Verify OTP
await authClient.signIn.otp.verify({
  email: 'user@example.com',
  code: '123456',
})
```

## Permissions & Roles

### Available Roles

- **Owner**: Full access to organization and all resources
- **Admin**: Administrative access, can manage users and settings
- **Member**: Standard member access
- **Viewer**: Read-only access

### Permission System

```typescript
import { ac, owner, admin, member, viewer } from '@databuddy/auth'

// Check permissions
const canDelete = ac
  .can(session.user.role)
  .deleteOwn('website')
  .granted

// Role hierarchy (most to least privileges)
// owner > admin > member > viewer
```

### Using Permissions in Code

```typescript
import { auth, ac } from '@databuddy/auth'

// Middleware example
async function checkPermission(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    throw new Error('Unauthorized')
  }

  // Check if user can update website
  const permission = ac.can(session.user.role).updateOwn('website')

  if (!permission.granted) {
    throw new Error('Forbidden')
  }

  return session
}
```

## Session Management

Sessions are stored in Redis for fast access and automatic expiration.

```typescript
// Get current session
const session = await auth.api.getSession({
  headers: request.headers,
})

// Session object structure
interface Session {
  user: {
    id: string
    email: string
    name: string
    image?: string
    emailVerified: boolean
    createdAt: Date
    updatedAt: Date
  }
  session: {
    id: string
    userId: string
    expiresAt: Date
    ipAddress?: string
    userAgent?: string
  }
}
```

## Organization Management

### Create Organization

```typescript
await authClient.organization.create({
  name: 'My Company',
  slug: 'my-company',
})
```

### Get User Organizations

```typescript
const organizations = await authClient.organization.list()
```

### Switch Active Organization

```typescript
await authClient.organization.setActive({
  organizationId: 'org_123',
})
```

### Invite User to Organization

```typescript
await authClient.organization.inviteUser({
  email: 'user@example.com',
  role: 'member',
  organizationId: 'org_123',
})
```

## Two-Factor Authentication

### Enable 2FA

```typescript
// Generate 2FA secret
const { secret, qrCode } = await authClient.twoFactor.enable()

// Display QR code to user for scanning with authenticator app

// Verify and activate 2FA
await authClient.twoFactor.verify({
  code: '123456',
  secret: secret,
})
```

### Sign In with 2FA

```typescript
// First, sign in with email/password
await authClient.signIn.email({
  email: 'user@example.com',
  password: 'secure-password',
})

// If 2FA enabled, prompt for code
await authClient.twoFactor.verify({
  code: '123456',
})
```

### Disable 2FA

```typescript
await authClient.twoFactor.disable({
  password: 'current-password',
})
```

## Configuration

### Environment Variables

```env
# Better Auth URL (your app's URL)
BETTER_AUTH_URL="https://app.yourdomain.com"

# Secret key for JWT signing (32+ characters)
BETTER_AUTH_SECRET="your-secure-secret-key-here"

# OAuth - Google
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# OAuth - GitHub
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Email service (Resend)
RESEND_API_KEY="re_your-api-key"

# Database & Redis (required)
DATABASE_URL="postgres://..."
REDIS_URL="redis://..."
```

### OAuth Provider Setup

**Google OAuth**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
4. Copy Client ID and Client Secret to `.env`

**GitHub OAuth**:
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set callback URL: `https://yourdomain.com/api/auth/callback/github`
4. Copy Client ID and Client Secret to `.env`

## Email Templates

Email templates are provided by `@databuddy/email` package:

- **Welcome Email**: Sent after user registration
- **Verification Email**: Email address verification
- **Magic Link Email**: Passwordless login link
- **OTP Email**: One-time password code
- **Password Reset Email**: Password reset link
- **Invitation Email**: Organization invitation

## Security Features

### Password Security

- **Bcrypt Hashing**: Passwords hashed with bcrypt (cost factor 10)
- **Minimum Length**: 8 characters minimum
- **No Plain Text**: Passwords never stored in plain text

### Session Security

- **HttpOnly Cookies**: Prevents XSS attacks
- **Secure Flag**: HTTPS-only in production
- **SameSite**: CSRF protection
- **Expiration**: Sessions auto-expire after 30 days

### CSRF Protection

- **Token-based**: CSRF tokens for state-changing operations
- **Double Submit**: Cookie + header validation

### Rate Limiting

- Login attempts limited per IP
- Password reset limited per email
- OTP requests limited per email

## Middleware

### Protect Routes

```typescript
import { auth } from '@databuddy/auth'

export async function protectedRoute(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return Response.redirect('/auth/sign-in')
  }

  // User is authenticated
  return handleRequest(session)
}
```

### Require Specific Role

```typescript
import { auth, ac } from '@databuddy/auth'

export async function adminOnlyRoute(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const permission = ac.can(session.user.role).readAny('settings')

  if (!permission.granted) {
    return new Response('Forbidden', { status: 403 })
  }

  // User has admin access
  return handleAdminRequest(session)
}
```

## API Reference

### Server API

```typescript
import { auth } from '@databuddy/auth'

// Get session
auth.api.getSession(options)

// Sign out
auth.api.signOut(options)

// Verify email
auth.api.verifyEmail(options)

// Reset password
auth.api.resetPassword(options)
```

### Client API

```typescript
import { authClient } from '@databuddy/auth/client'

// Sign in
authClient.signIn.email(data)
authClient.signIn.social(data)
authClient.signIn.magicLink(data)
authClient.signIn.otp.send(data)
authClient.signIn.otp.verify(data)

// Sign up
authClient.signUp.email(data)

// Sign out
authClient.signOut()

// Session
authClient.useSession() // React hook
authClient.getSession() // Promise

// Organization
authClient.organization.create(data)
authClient.organization.list()
authClient.organization.inviteUser(data)

// 2FA
authClient.twoFactor.enable()
authClient.twoFactor.verify(data)
authClient.twoFactor.disable(data)
```

## Troubleshooting

### "Unauthorized" Errors

- Check `BETTER_AUTH_SECRET` is set and matches across services
- Verify `BETTER_AUTH_URL` matches your application URL
- Ensure cookies are enabled in browser
- Check session hasn't expired

### OAuth Not Working

- Verify OAuth credentials in `.env`
- Check redirect URIs match in OAuth provider settings
- Ensure OAuth provider is enabled in Better Auth config

### Email Not Sending

- Verify `RESEND_API_KEY` is set
- Check Resend dashboard for delivery logs
- Verify sender email is verified in Resend

## Related Documentation

- [Better Auth Documentation](https://better-auth.com/)
- [Databuddy Architecture](../../ARCHITECTURE.md)
- [Contributing Guide](../../CONTRIBUTING.md)

## Exports

```typescript
// Main auth instance
export { auth }

// Client for browser usage
export { authClient }

// Permission system
export { ac, owner, admin, member, viewer }

// Types
export type { Session, User, Organization }
```
