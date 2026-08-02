# Contributing Guide

Thank you for your interest in contributing!

## AI Usage

The Databuddy project has strict rules for AI usage. Please see
the [AI Usage Policy](AI_POLICY.md). **This is very important.**

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
docker compose up -d
```

> **Note:** This starts the **development** infrastructure only (`docker-compose.yaml`).
> For self-hosting with all application services, use `docker compose -f docker-compose.selfhost.yml up -d` instead — see the [Self-Hosting section](README.md#-self-hosting) in the README.

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
bun run dev:dashboard
```

8. Seed the database with sample data (optional):

```bash
bun run db:seed <WEBSITE_ID> [EVENT_COUNT]
```

**Examples:**

```bash
bun run db:seed g0zlgMtBaXzIP1EGY2ieG 10000
bun run db:seed d7zlgMtBaSzIL1EGR2ieR 5000
```

**Note:** 
- The domain is automatically fetched from the database based on the website ID
- Default event count is 10,000 if not specified
- Seeds events, outgoing links, errors, and web vitals data
- You can find your website ID in your website overview settings

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

#### Branch and PR lifecycle

Keep each branch short-lived: one branch, one independently reviewable and
revertible slice, one pull request. Do not use a branch as a general work
queue.

1. Before starting, check open pull requests for the same surface, public
   contract, schema, or deployment configuration. Update `staging`, then create
   a fresh branch from it:

```bash
git switch staging
git pull --ff-only origin staging
git switch -c codex/short-slice
```

   Do not branch from another feature branch. An exception needs an explicit
   `Depends on #…` in both PRs and agreement from its owner; land the
   prerequisite first.

2. Keep the branch to its stated slice. If a change can be reviewed or reverted
   independently, open a separate branch and PR; leave unrelated cleanup and
   refactors out of the current one.

3. Push early and open a draft PR against `staging`. State the problem being
   solved and any dependency or known overlap. This makes ownership visible
   before parallel work drifts into the same files.

4. Before requesting review, rebase onto the current `origin/staging` and
   resolve the conflicts in the slice. Do not merge `staging` into a feature
   branch just to refresh it. If the rebase changes reviewed code, request a
   fresh review.

5. Run the relevant checks:

```bash
bun run test
```

6. Create a changeset when the change affects a published package:

```bash
bun run changeset
```

7. Commit your changes:

```bash
git add .
git commit -m "feat: your feature"
```

8. Push your changes:

```bash
git push -u origin codex/short-slice
```

9. When the PR is merged or closed, retire the branch. GitHub automatically
   deletes merged source branches; delete a closed branch manually. Never
   repurpose or reopen an old branch for a new slice—start again from current
   `staging`.

For parallel work, use one worktree per branch and never have two people or
agents mutate the same branch. Remove a worktree only after its work is merged,
closed, or safely moved to a new branch.


## Code Style

- Use Biome for linting and formatting
- Follow the coding standards in the README
- Keep it simple and type-safe
