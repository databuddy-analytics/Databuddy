# Contributing Guide

Thank you for your interest in contributing!

## 🚀 Getting Started

### Installation

1. Clone the repository:

```bash
git clone https://github.com/databuddy-analytics/Databuddy.git
cd databuddy
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

4. Start Docker services (PostgreSQL, Redis, ClickHouse):

```bash
docker-compose up -d
```

5. Set up the database:

```bash
bun run db:push        # Apply database schema
bun run clickhouse:init # Initialize ClickHouse basket
```

6. Build the SDK:

```bash
bun run sdk:build
```

7. Start development servers:

```bash
bun run dev
```

8. Seed the database with sample data (optional):

```bash
bun run db:seed <WEBSITE_ID> [DOMAIN] [EVENT_COUNT]
```

**Examples:**

```bash
bun run db:seed g0zlgMtBaXzIP1EGY2ieG onlybuddies.com 10000
bun run db:seed d7zlgMtBaSzIL1EGR2ieR notmybuddy.cc 5000
```

**Note:** You can find your website ID in your website overview settings.

## 💻 Development

### Available Scripts

Check the root `package.json` for available scripts. Here are some common ones:

- `bun run dev` - Start all applications in development mode
- `bun run build` - Build all applications
- `bun run start` - Start all applications in production mode
- `bun run lint` - Lint all code with Ultracite
- `bun run format` - Format all code with Prettier
- `bun run check-types` - Type check all TypeScript code
- `bun run db:studio` - Open Drizzle Studio for database management
- `bun run db:push` - Apply database schema changes
- `bun run db:migrate` - Run database migrations
- `bun run db:deploy` - Deploy database migrations
- `bun run sdk:build` - Build the SDK package
- `bun run email:dev` - Start the email development server

You can also `cd` into any package and run its scripts directly.

### Development Workflow

1. Create a new branch:

```bash
git checkout -b feature/your-feature
```

2. Make your changes

3. Run tests:

```bash
bun run test
```

4. Create a changeset:

```bash
bun run changeset
```

5. Commit your changes:

```bash
git add .
git commit -m "feat: your feature"
```

6. Push your changes:

```bash
git push origin feature/your-feature
```

Note: Open a pull request to the STAGING branch

7. Create a Pull Request


## Code Style

### Linting and Formatting

- **Use Ultracite** for linting (not ESLint)
- **Use Prettier** for code formatting
- **Use Biome** for fast linting and formatting where applicable
- Run `bun run lint` before committing to ensure code quality
- Run `bun run format` to auto-format your code

### Coding Standards

Follow the coding standards outlined in the README and `.cursor/rules/`:

**Required Tools & Libraries:**
- **Bun** - Required for all development (never use npm/pnpm/Node CLI)
- **Zod v4** - Use `zod/v4` everywhere (not Zod v3)
- **Phosphor Icons** - Use only Phosphor icons (not Lucide)
- **Dayjs** - Use for all date handling (never date-fns)
- **TanStack Query** - Use for data fetching hooks (never SWR)

**Style Guidelines:**
- **Border Radius**: Use `rounded` (never `rounded-xl` or `rounded-md`)
- **Type Safety**: Always ensure type-safety and use shared types
- **Error Handling**: Never throw errors in server actions; use try/catch and return errors
- **Error Boundaries**: Always use error boundaries properly
- **Console Usage**: Use appropriate console methods (`console.error`, `console.time`, `console.json`, `console.table`)
- **useEffect**: Almost never use `useEffect` unless critical
- **No Placeholders**: Never add placeholders or mock data

See `.cursor/rules/` for the complete enforced ruleset.

## Testing

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Run specific test file
bun test path/to/test.test.ts
```

### Writing Tests

**Unit Tests:**
- Use Vitest for unit testing
- Place tests next to the code they test (`*.test.ts`)
- Aim for >80% code coverage
- Mock external dependencies

**Example unit test:**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { calculateMetrics } from './analytics'

describe('calculateMetrics', () => {
  it('should calculate basic metrics correctly', () => {
    const events = [
      { type: 'pageview', timestamp: Date.now() },
      { type: 'pageview', timestamp: Date.now() }
    ]

    const metrics = calculateMetrics(events)

    expect(metrics.pageviews).toBe(2)
  })

  it('should handle empty events array', () => {
    const metrics = calculateMetrics([])

    expect(metrics.pageviews).toBe(0)
  })
})
```

**Integration Tests:**
- Test API endpoints and database operations
- Use test database and Redis instances
- Clean up test data after each test

**E2E Tests:**
- Use Playwright for end-to-end testing
- Test critical user flows
- Run in CI/CD pipeline

### Test Coverage Requirements

Maintain test coverage above these thresholds:
- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

## Code Review Process

All contributions go through code review before merging:

1. **Automated Checks**: CI/CD runs tests, linting, and type checking
2. **CodeRabbit Review**: Automated AI review for common issues
3. **Manual Review**: Maintainer reviews code for:
   - Code quality and style adherence
   - Test coverage
   - Security considerations
   - Performance implications
   - Documentation completeness

### Review Checklist

Before requesting review, ensure:
- [ ] All tests pass
- [ ] Code is formatted and linted
- [ ] Types are correct (no `any` types)
- [ ] Documentation is updated
- [ ] Changeset created
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Error handling implemented

## Architecture Guidelines

### Monorepo Structure

```
Databuddy/
├── apps/
│   ├── web/           # Main dashboard application
│   ├── docs/          # Documentation site
│   └── dashboard/     # Analytics dashboard
├── packages/
│   ├── sdk/           # Client-side SDK
│   ├── tracker/       # Event tracking
│   ├── db/            # Database utilities
│   ├── validation/    # Shared validation schemas
│   └── ui/            # Shared UI components
└── infrastructure/    # Deployment configurations
```

### Adding New Features

**1. Plan your feature:**
- Discuss in GitHub Issues first for major features
- Consider backward compatibility
- Plan database migrations if needed

**2. Implement incrementally:**
- Start with types and schemas (Zod v4)
- Implement core logic with tests
- Add UI components
- Update documentation

**3. Database Changes:**
```bash
# Make schema changes in packages/db/schema/

# Generate migration
bun run db:generate

# Apply to local database
bun run db:push

# Test migration
bun run db:migrate
```

**4. Add appropriate tests:**
- Unit tests for utilities and logic
- Integration tests for API endpoints
- E2E tests for user-facing features

### Performance Considerations

- **Database**: Index frequently queried columns
- **Caching**: Use Redis for expensive queries
- **Bundle Size**: Keep client bundles small (<200KB)
- **Batching**: Batch analytics events (use built-in batching)
- **Images**: Use Next.js Image optimization

## Documentation

### When to Update Docs

Update documentation when:
- Adding new features
- Changing APIs or behavior
- Fixing bugs that affect usage
- Adding configuration options
- Changing deployment procedures

### Documentation Files

- **README.md** - Project overview and quick start
- **CONTRIBUTING.md** - This file
- **DEPLOYMENT.md** - Deployment and operations
- **apps/docs/** - User-facing documentation site
- **Code comments** - Document complex logic

### Writing Good Documentation

- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep it up-to-date
- Test all examples
