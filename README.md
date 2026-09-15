# Databuddy

<div align="center">

[![License: AGPL](https://img.shields.io/badge/License-AGPL-red.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://reactjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.7-blue.svg)](https://turbo.build/repo)
[![Bun](https://img.shields.io/badge/Bun-1.3-blue.svg)](https://bun.sh/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-blue.svg)](https://tailwindcss.com/)

[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/databuddy-analytics/Databuddy?utm_source=oss&utm_medium=github&utm_campaign=databuddy-analytics%2FDatabuddy&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![Code Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/coverage.yml)
[![Security Scan](https://img.shields.io/badge/security-A%2B-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/security.yml)
[![Dependency Status](https://img.shields.io/badge/dependencies-up%20to%20date-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/dependencies.yml)

[<img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />](https://vercel.com/oss)

[![Discord](https://img.shields.io/badge/Discord-Join-blue?logo=discord)](https://discord.gg/JTk7a38tCZ)
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
- 📈 Export capabilities
- 🔒 GDPR compliance
- 🔐 Data encryption
- 📊 API access

## 📚 Table of Contents

1. **How do I get started?**
   Follow the [Getting Started](https://www.databuddy.cc/docs/getting-started) guide.
- [Contributing](#-contributing)
- [Security](#-security)
- [FAQ](#-faq)
- [Support](#-support)
- [License](#-license)

### Prerequisites

- Bun 1.3.14+
- Node.js 20+

## 🏠 Self-Hosting

Databuddy can be self-hosted using Docker Compose. The repo includes two compose files:

| File | Purpose |
|---|---|
| `docker-compose.yaml` | **Development only** — starts infrastructure (Postgres, ClickHouse, Redis) for local dev |
| `docker-compose.selfhost.yml` | **Self-hosting** — backend images plus a dashboard built for your URLs |

### Quick Start

Use a checkout matching `IMAGE_TAG`. Docker Compose is sufficient; Bun and Node
are only needed for local development. For local testing, use
`http://localhost:3000`, `http://localhost:3001`, and `http://localhost:4000`
for the dashboard, API, and Basket URLs.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — set IMAGE_TAG, POSTGRES_PASSWORD, CLICKHOUSE_PASSWORD,
# REDIS_PASSWORD, BETTER_AUTH_SECRET, DATABUDDY_ENCRYPTION_KEY, and the
# DASHBOARD_URL, API_URL, BASKET_URL public URLs. Use URL-safe passwords.

# 2. Start databases and cache
docker compose -f docker-compose.selfhost.yml up -d postgres clickhouse redis

# 3. Initialize databases using the matching release image
docker compose -f docker-compose.selfhost.yml run --rm init

# 4. Build the dashboard for your URLs and start the services
docker compose -f docker-compose.selfhost.yml up -d --build
```

The `init` service contains the schema source and tooling; the compiled API
image does not. It runs PostgreSQL `db:push`, then creates missing ClickHouse
tables and views. It only runs when explicitly requested. No local Bun install
or custom migration script is needed.

For upgrades, back up your databases, check out the new release, and set
`IMAGE_TAG` to that release. Apply PostgreSQL changes separately so you can review
any schema change prompts:

```bash
docker compose -f docker-compose.selfhost.yml pull init
docker compose -f docker-compose.selfhost.yml run --rm init bun run --cwd packages/db db:push
```

If you decline a PostgreSQL change, stop the upgrade. After accepting the changes,
create any missing ClickHouse objects with
`docker compose -f docker-compose.selfhost.yml run --rm init bun --cwd packages/db src/clickhouse/setup.ts`.
This only creates missing objects; apply any additional migrations listed in the
release notes separately before starting the updated services.

To verify a local init image against disposable databases, run
`bash scripts/test-selfhost-init.sh` (requires Docker Compose 2.24.4 or later).

Services started:
- **Dashboard** → `localhost:3000`
- **API** → `localhost:3001`
- **Basket** (event ingestion) → `localhost:4000`
- **Links** (short links) → `localhost:2500`

Ports are configurable (`DASHBOARD_PORT`, `API_PORT`, `BASKET_PORT`, `LINKS_PORT`).
For remote access, put the dashboard and API behind HTTPS on the same parent
domain and set `BETTER_AUTH_COOKIE_DOMAIN` (for example `.example.com`) so login
works across subdomains. Leave it empty for localhost. Rebuild the dashboard
with `docker compose -f docker-compose.selfhost.yml up -d --build` after changing
public URLs; they are embedded in its browser bundle.

### Optional services

Email is optional for self-host signup. For password resets, invitations, and
alerts, set `RESEND_API_KEY` and `EMAIL_FROM` to a sender on your verified domain,
for example `Databuddy <no-reply@example.com>`. Leave `ALERTS_EMAIL_FROM` empty to
reuse that sender. Recreate services after changing these values.

Insights is opt-in: configure its AI and billing providers, then run
`docker compose -f docker-compose.selfhost.yml --profile insights up -d insights`.
Basic analytics and link delivery do not require an AI key or Kafka.
Error analytics and creating goals, funnels, or feature flags still require an
Autumn billing provider configuration. The billing UI can show errors without it.
DQL requires separate restricted-user provisioning; never use the application's
admin ClickHouse credentials for DQL.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## ❓ FAQ

### General

1. **What is Databuddy?**
   Databuddy is a comprehensive analytics and data management platform.

2. **How do I get started?**
   Follow the [Getting Started](https://www.databuddy.cc/docs/getting-started) guide.

3. **Is it free?**
   Check our [pricing page](https://databuddy.cc/pricing).

### Technical

1. **What are the system requirements?**
   See [Prerequisites](#prerequisites).

2. **How do I deploy?**
   See the deployment documentation in our [docs](https://databuddy.cc/docs).

3. **How do I contribute?**
   See [Contributing](#contributing).

## 💬 Support

- [Documentation](https://www.databuddy.cc/docs)
- [Discord](https://discord.gg/JTk7a38tCZ)
- [Twitter](https://twitter.com/trydatabuddy)
- [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues)
- [Email Support](mailto:support@databuddy.cc)

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Databuddy Analytics, Inc.
