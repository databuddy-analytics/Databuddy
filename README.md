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

- Bun 1.3.4+
- Node.js 20+

## 🏠 Self-Hosting

Databuddy can be self-hosted using Docker Compose. The repo includes two compose files:

| File | Purpose |
|---|---|
| `docker-compose.yaml` | **Development only** — starts infrastructure (Postgres, ClickHouse, Redis) for local dev |
| `docker-compose.selfhost.yml` | **Production / self-hosting** — full stack with all application services from GHCR images |

### Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — at minimum set BETTER_AUTH_SECRET and BETTER_AUTH_URL

# 2. Start everything
docker compose -f docker-compose.selfhost.yml up -d

# 3. Initialize databases (first run only)
docker compose -f docker-compose.selfhost.yml exec api bun run db:push
docker compose -f docker-compose.selfhost.yml exec api bun run clickhouse:init
```

Services started:
- **API** → `localhost:3001`
- **Basket** (event ingestion) → `localhost:4000`
- **Links** (short links) → `localhost:2500`
- **Uptime** monitoring is optional — uncomment in the compose file and set QStash keys.

All ports are configurable via env vars (`API_PORT`, `BASKET_PORT`, etc.). See the compose file comments for the full env var reference.

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
