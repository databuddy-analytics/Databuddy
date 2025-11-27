# Databuddy Dashboard

The main user interface for Databuddy analytics platform, built with Next.js 15, React 19, and Tailwind CSS 4.

## Overview

The Dashboard is the primary frontend application that provides:
- Real-time analytics visualization
- Website management and configuration
- User authentication and session management
- Team and organization management
- Data export capabilities
- Interactive charts and dashboards

## Technology Stack

- **Next.js 15**: React framework with App Router
- **React 19**: UI library with Server Components
- **TypeScript**: Type-safe development
- **Tailwind CSS 4**: Utility-first styling
- **Radix UI**: Accessible component primitives
- **Phosphor Icons**: Icon library
- **Tanstack Query**: Server state management
- **Jotai**: Client state management
- **Framer Motion**: Animations
- **Better Auth**: Authentication

## Getting Started

### Prerequisites

- Bun 1.2.19 or higher
- PostgreSQL database running
- Redis instance running
- Environment variables configured

### Development

**Important**: Use Bun, not npm, pnpm, or yarn.

```bash
# From the root of the monorepo
bun dev

# Or run dashboard only
bun dashboard:dev
```

The dashboard will be available at [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env` file in the root of the monorepo with:

```env
# API URL
NEXT_PUBLIC_API_URL="http://localhost:3001"

# Database
DATABASE_URL="postgres://user:password@localhost:5432/databuddy"

# Redis
REDIS_URL="redis://localhost:6379"

# Better Auth
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secure-secret"

# Optional: OAuth providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

## Project Structure

```
apps/dashboard/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   ├── (dashboard)/       # Main dashboard routes
│   ├── api/               # API routes (auth callbacks)
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── ...               # Feature-specific components
├── lib/                   # Utility functions
├── public/                # Static assets
└── styles/                # Global styles
```

## Key Features

### Real-Time Analytics

- Live visitor count
- Real-time page views
- Session tracking
- Geographic distribution
- Device and browser analytics

### Dashboard Views

- **Overview**: High-level metrics and trends
- **Pages**: Top pages and traffic sources
- **Locations**: Geographic data visualization
- **Devices**: Device, browser, and OS breakdown
- **UTM Tracking**: Campaign performance
- **Custom Events**: Track custom actions

### Website Management

- Add/remove websites
- Configure tracking settings
- Manage team access
- API key management

### User Features

- User profile management
- Organization settings
- Team invitations
- Role-based access control

## Routing

The dashboard uses Next.js App Router with route groups:

### Authentication Routes

- `/sign-in` - Sign in page
- `/sign-up` - Sign up page
- `/auth/error` - Auth error page
- `/auth/verify-email` - Email verification

### Dashboard Routes

- `/` - Dashboard home
- `/[websiteId]/overview` - Analytics overview
- `/[websiteId]/pages` - Page analytics
- `/[websiteId]/locations` - Location analytics
- `/[websiteId]/devices` - Device analytics
- `/settings` - User settings
- `/settings/organization` - Organization settings

## Components

### UI Components

Located in `components/ui/`, built on Radix UI:

- **Button**: Customizable button with variants
- **Card**: Container component
- **Dialog**: Modal dialogs
- **Dropdown**: Dropdown menus
- **Input**: Form inputs
- **Select**: Select dropdowns
- **Table**: Data tables
- **Toast**: Notifications (via Sonner)

### Feature Components

- **Analytics Charts**: Line charts, bar charts, pie charts
- **Website Selector**: Switch between tracked websites
- **Date Range Picker**: Select analytics time period
- **Real-Time Badge**: Live visitor indicator
- **Export Button**: Download analytics data

## State Management

### Server State (Tanstack Query)

Used for data fetching and caching:

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

function useWebsites() {
  return useQuery({
    queryKey: ['websites'],
    queryFn: () => apiClient.websites.list(),
  })
}
```

### Client State (Jotai)

Used for UI state and preferences:

```typescript
import { atom, useAtom } from 'jotai'

const websiteIdAtom = atom<string | null>(null)

function WebsiteSelector() {
  const [websiteId, setWebsiteId] = useAtom(websiteIdAtom)
  // ...
}
```

## Styling

### Tailwind CSS 4

The dashboard uses Tailwind CSS with custom configuration:

- **Design Tokens**: Colors, spacing, typography
- **Dark Mode**: Full dark mode support
- **Responsive**: Mobile-first design
- **Border Radius**: Always use `rounded` (not `rounded-xl` or `rounded-md`)

### Custom Styles

Global styles in `styles/globals.css`:
- CSS variables for theming
- Custom scrollbar styles
- Animation keyframes

## Authentication

Authentication is handled by Better Auth (`@databuddy/auth`):

```typescript
import { auth } from '@databuddy/auth'

// Server Component
async function DashboardPage() {
  const session = await auth.api.getSession({ headers })

  if (!session) {
    redirect('/sign-in')
  }

  return <Dashboard user={session.user} />
}

// Client Component
'use client'
import { useSession } from '@databuddy/auth/client'

function UserMenu() {
  const { data: session } = useSession()

  return <div>{session?.user.email}</div>
}
```

## Data Fetching

### ORPC Client

Type-safe API calls using ORPC:

```typescript
import { apiClient } from '@/lib/api'

// Automatically typed
const websites = await apiClient.websites.list()

// With error handling
try {
  const data = await apiClient.analytics.pageViews({
    websiteId: '123',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  })
} catch (error) {
  console.error('Failed to fetch analytics', error)
}
```

### Server Components

Fetch data directly in Server Components:

```typescript
async function AnalyticsOverview({ websiteId }: Props) {
  const data = await apiClient.analytics.overview({ websiteId })

  return <ChartComponent data={data} />
}
```

### Client Components

Use Tanstack Query for client-side fetching:

```typescript
'use client'

function RealtimeStats({ websiteId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['realtime', websiteId],
    queryFn: () => apiClient.analytics.realtime({ websiteId }),
    refetchInterval: 5000, // Poll every 5 seconds
  })

  return <LiveBadge count={data?.visitors} />
}
```

## Building for Production

```bash
# From root of monorepo
bun build

# Or build dashboard specifically
cd apps/dashboard
bun run build
```

The build output will be in `.next/` directory.

## Deployment

### Vercel (Recommended)

1. Connect GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Docker

Build Docker image:

```bash
# From root of monorepo
docker build -f dashboard.Dockerfile -t databuddy-dashboard .

# Run container
docker run -p 3000:3000 --env-file .env databuddy-dashboard
```

### Self-Hosted

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for comprehensive deployment guide.

## Development Guidelines

### Code Style

- Use TypeScript for all files
- Use functional components with hooks
- Prefer Server Components when possible
- Use async/await for promises
- Handle errors with try/catch
- Use Zod v4 for validation (`zod/v4`)

### Component Patterns

```typescript
// Server Component (default)
async function ServerComponent({ id }: Props) {
  const data = await fetchData(id)
  return <div>{data.name}</div>
}

// Client Component (when needed)
'use client'
import { useState } from 'react'

function ClientComponent({ id }: Props) {
  const [state, setState] = useState()
  // Interactive UI logic
  return <button onClick={() => setState(...)}>Click</button>
}
```

### Naming Conventions

- **Components**: PascalCase (`UserProfile.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Files**: kebab-case (`user-profile.tsx`)
- **Constants**: SCREAMING_SNAKE_CASE

### Imports

```typescript
// Absolute imports (preferred)
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'

// Relative imports (when necessary)
import { helper } from './helper'
```

## Testing

```bash
# Run tests
bun test ./apps/dashboard

# Watch mode
bun test:watch ./apps/dashboard

# Coverage
bun test:coverage ./apps/dashboard
```

## Troubleshooting

### Dashboard Won't Start

- Check environment variables are set
- Verify database and Redis are running
- Check port 3000 is not in use

### Authentication Issues

- Verify `BETTER_AUTH_SECRET` is set
- Check `BETTER_AUTH_URL` matches your URL
- Clear cookies and try again

### Slow Loading

- Check API server is running (port 3001)
- Verify `NEXT_PUBLIC_API_URL` is correct
- Check network tab for failed requests

## Related Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Tanstack Query](https://tanstack.com/query)
- [Better Auth](https://better-auth.com/)
- [Databuddy Architecture](../../ARCHITECTURE.md)
- [Contributing Guide](../../CONTRIBUTING.md)
