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

- Use Biome for linting and formatting
- Follow the coding standards in the README
- Keep it simple and type-safe
