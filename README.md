# Databuddy

<div align="center">

[![License: AGPL](https://img.shields.io/badge/License-AGPL-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-blue.svg)](https://reactjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-1.12-blue.svg)](https://turbo.build/repo)
[![Bun](https://img.shields.io/badge/Bun-1.2-blue.svg)](https://bun.sh/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-blue.svg)](https://tailwindcss.com/)

[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/databuddy-analytics/Databuddy?utm_source=oss&utm_medium=github&utm_campaign=databuddy-analytics%2FDatabuddy&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![CI/CD](https://github.com/databuddy/databuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/databuddy/databuddy/actions/workflows/ci.yml)
[![Code Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](https://github.com/databuddy/databuddy/actions/workflows/coverage.yml)
[![Security Scan](https://img.shields.io/badge/security-A%2B-green.svg)](https://github.com/databuddy/databuddy/actions/workflows/security.yml)
[![Dependency Status](https://img.shields.io/badge/dependencies-up%20to%20date-green.svg)](https://github.com/databuddy/databuddy/actions/workflows/dependencies.yml)

[![Discord](https://img.shields.io/discord/123456789?label=Discord&logo=discord)](https://discord.gg/JTk7a38tCZ)
[![GitHub Stars](https://img.shields.io/github/stars/databuddy-analytics/Databuddy?style=social)](https://github.com/databuddy-analytics/Databuddy/stargazers)
[![Twitter](https://img.shields.io/twitter/follow/trydatabuddy?style=social)](https://twitter.com/trydatabuddy)

</div>

A comprehensive analytics and data management platform built with Next.js, TypeScript, and modern web technologies. Databuddy provides real-time analytics, user tracking, and data visualization capabilities for web applications.

## 🌟 Features

- 📊 Real-time analytics dashboard
- 👥 User behavior tracking
- 📈 Advanced data visualization // Soon
- 🔒 Secure authentication
- 📱 Responsive design
- 🌐 Multi-tenant support
- 🔄 Real-time updates // Soon
- 📊 Custom metrics // Soon
- 🎯 Goal tracking
- 📈 Conversion analytics
- 🔍 Custom event tracking
- 📊 Funnel analysis
- 📈 Cohort analysis // Soon
- 🔄 A/B testing // Soon
- 📈 Export capabilities // Soon
- 🔒 GDPR compliance
- 🔐 Data encryption
- 📊 API access

## 📚 Table of Contents

- [Getting Started](#-getting-started)
- [Development](#-development)
- [Contributing](#-contributing)
- [Security](#-security)
- [FAQ](#-faq)
- [Support](#-support)
- [License](#-license)

## 🚀 Getting Started

### Prerequisites

- Bun
- PostgreSQL
- Redis
- Cloudflare account
- Vercel account

### Installation

1. Clone the repository:

```bash
git clone https://github.com/databuddy/databuddy.git
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
bun db:push
```

6. Build the SDK:

```bash
bun sdk:build
```

7. Start development servers:

```bash
bun run dev
```

8. Seed the database with sample data (optional):

```bash
bun db:seed <WEBSITE_ID> [DOMAIN] [EVENT_COUNT]
```

**Examples:**

```bash
bun db:seed g0zlgMtBaXzIP1EGY2ieG onlybuddies.com 10000
bun db:seed d7zlgMtBaSzIL1EGR2ieR notmybuddy.cc 5000
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
- `bun run db:generate` - Generate Drizzle ORM types
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

7. Create a Pull Request

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## ❓ FAQ

### General

1. **What is Databuddy?**
   Databuddy is a comprehensive analytics and data management platform.

2. **How do I get started?**
   Follow the [Getting Started](#getting-started) guide.

3. **Is it free?**
   Check our [pricing page](https://databuddy.cc/pricing).

### Technical

1. **What are the system requirements?**
   See [Prerequisites](#prerequisites).

2. **How do I deploy?**
   See the deployment documentation in our [docs](https://docs.databuddy.cc).

3. **How do I contribute?**
   See [Contributing](#contributing).

## 💬 Support

- [Documentation](https://docs.databuddy.cc)
- [Discord](https://discord.gg/JTk7a38tCZ)
- [Twitter](https://twitter.com/databuddyps)
- [GitHub Issues](https://github.com/databuddy/databuddy/issues)
- [Email Support](mailto:support@databuddy.cc)

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Databuddy

## 🙏 Acknowledgments

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for credits.

## ⚠️ Coding Standards & Rules

- **Bun is required** for all development and scripts. Do not use npm, pnpm, or Node.js CLI for install, run, or dev.
- **Zod v4** (from `zod/v4`) is required everywhere. Do not use Zod v3.
- **Use only Phosphor icons** (not Lucide).
- **Use Dayjs** for date handling (never date-fns).
- **Use Tanstack Query** for hooks (never SWR).
- **Use rounded** for border radius (never rounded-xl or rounded-md).
- **Never add placeholders or mock data.**
- **Always ensure type-safety** and use shared types where possible.
- **Never throw errors in server actions;** use try/catch and return errors to the client.
- **Always use error boundaries properly.**
- **Console usage:** Use `console.error`, `console.time`, `console.json`, `console.table`, etc. appropriately.
- **Almost never use useEffect** unless critical.
- **Use Ultracite** for linting and formatting.
- **Use Prettier** for code formatting.

See `.cursor/rules/` for the full enforced ruleset.
