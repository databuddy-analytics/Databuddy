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
[![Code Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/coverage.yml)
[![Security Scan](https://img.shields.io/badge/security-A%2B-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/security.yml)
[![Dependency Status](https://img.shields.io/badge/dependencies-up%20to%20date-green.svg)](https://github.com/databuddy-analytics/Databuddy/actions/workflows/dependencies.yml)

[<img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />](https://vercel.com/oss)

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

## 📚 Documentation

### Getting Started
- 🚀 [Quick Start Guide](https://www.databuddy.cc/docs/getting-started) - Get up and running in minutes
- ❓ [FAQ](FAQ.md) - Frequently asked questions
- 💻 [Contributing Guide](CONTRIBUTING.md) - Learn how to contribute to the project
- 🚢 [Deployment Guide](DEPLOYMENT.md) - Deploy Databuddy to production
- 🔧 [Troubleshooting Guide](TROUBLESHOOTING.md) - Resolve common issues
- 🔒 [Security Policy](SECURITY.md) - Report security vulnerabilities
- 🙏 [Acknowledgments](ACKNOWLEDGMENTS.md) - Credits and thanks

### Developer Resources
- [Architecture Overview](WARP.md) - System architecture and WARP CLI
- [API Documentation](https://www.databuddy.cc/docs/api) - Complete API reference
- [SDK Documentation](https://www.databuddy.cc/docs/sdk) - Client-side SDK guide
- [Dashboard Guide](https://www.databuddy.cc/docs/dashboard) - Analytics dashboard features

### Prerequisites

- Bun 1.2+

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
   See the [Deployment Guide](DEPLOYMENT.md).

3. **How do I contribute?**
   See [Contributing Guide](CONTRIBUTING.md).

4. **I'm having issues, where do I get help?**
   Check the [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues and solutions.

## 💬 Support

- [Documentation](https://www.databuddy.cc/docs)
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
