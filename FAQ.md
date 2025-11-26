# Frequently Asked Questions (FAQ)

This document answers common questions about Databuddy.

## Table of Contents

- [General Questions](#general-questions)
- [Getting Started](#getting-started)
- [Features & Functionality](#features--functionality)
- [Privacy & Compliance](#privacy--compliance)
- [Technical Questions](#technical-questions)
- [Pricing & Licensing](#pricing--licensing)
- [Troubleshooting](#troubleshooting)

## General Questions

### What is Databuddy?

Databuddy is a comprehensive, privacy-first analytics platform built with Next.js, TypeScript, and modern web technologies. It provides real-time analytics, user tracking, and data visualization capabilities while being fully GDPR compliant and respecting user privacy.

### How is Databuddy different from Google Analytics?

**Key differences:**
- **Privacy-first**: No cookies, no personal data collection, fully GDPR compliant
- **Lightweight**: Small bundle size (~15KB gzipped vs GA's 45KB+)
- **Real-time**: Instant data updates without delays
- **Self-hostable**: Full control over your data
- **Open source**: Transparent code you can audit
- **Simple**: Easy to implement and understand
- **No data sampling**: Get 100% of your data, not estimates

### Is Databuddy open source?

Yes! Databuddy is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). This means:
- Free to use, modify, and distribute
- Source code is publicly available
- Commercial use is allowed
- Modifications must be shared if you distribute the software
- Network use (SaaS) requires sharing modifications

### Who maintains Databuddy?

Databuddy is maintained by the Databuddy team and the open source community. We welcome contributions from developers worldwide. See our [Contributing Guide](CONTRIBUTING.md) for details.

## Getting Started

### How do I install Databuddy?

**For tracking (client-side):**
```bash
# Using bun
bun add @databuddy/sdk

# Using npm
npm install @databuddy/sdk
```

**For self-hosting (full application):**
See our comprehensive [Deployment Guide](DEPLOYMENT.md).

**Quick start:**
Check out our [Getting Started Guide](https://www.databuddy.cc/docs/getting-started) for step-by-step instructions.

### What are the system requirements?

**For development:**
- Bun 1.2+ (or Node.js 20+)
- PostgreSQL 14+
- ClickHouse 23+
- Redis 7+
- 4GB RAM minimum (8GB recommended)

**For production:**
- 4+ CPU cores
- 8GB+ RAM
- 50GB+ SSD storage
- Linux (Ubuntu 22.04 LTS recommended)

See [Deployment Guide](DEPLOYMENT.md) for detailed requirements.

### Can I use Databuddy with my existing website?

Yes! Databuddy supports multiple integration methods:
- **Script tag**: Add a simple script tag to any HTML page
- **React/Next.js**: Use the React component
- **Vanilla JavaScript**: Direct JavaScript integration
- **WordPress**: Official WordPress plugin
- **Shopify**: Shopify app integration
- **Framer**: Framer integration

See our [Integration Guides](https://www.databuddy.cc/docs) for platform-specific instructions.

### How long does setup take?

**For tracking only:** 5-10 minutes
- Sign up for account
- Install SDK or add script tag
- Start tracking immediately

**For self-hosting:** 30-60 minutes
- Set up infrastructure (Docker recommended)
- Configure databases
- Deploy application
- Configure domains and SSL

## Features & Functionality

### What data does Databuddy track?

**Automatic tracking:**
- Page views
- Unique visitors
- Sessions
- Page load times
- Core Web Vitals (LCP, FCP, CLS)
- Device information (browser, OS, device type)
- Geographic location (country, city)
- Referrer information

**Optional tracking:**
- Custom events
- User properties
- Error tracking
- Scroll depth
- Outbound link clicks
- Form interactions
- JavaScript errors

**Privacy note:** All tracking is anonymous - no cookies, no personal data, no cross-site tracking.

### Can I track custom events?

Yes! Custom event tracking is fully supported:

```javascript
// Track button click
db.track('button_clicked', {
  button_name: 'signup',
  page: '/pricing'
})

// Track purchase
db.track('purchase', {
  product_id: 'pro-plan',
  value: 29.99,
  currency: 'USD'
})

// Track any custom event
db.track('custom_event', {
  property1: 'value1',
  property2: 'value2'
})
```

See [SDK Documentation](https://www.databuddy.cc/docs/sdk) for more examples.

### Does Databuddy support A/B testing?

A/B testing and feature flags are coming soon! Track our [TODO.md](TODO.md) or [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues) for updates.

### Can I export my data?

Yes! Export options:
- **CSV export**: Download analytics data as CSV
- **JSON export**: Download as JSON for custom processing
- **API access**: Query your data programmatically
- **Direct database access**: Full access if self-hosting

Data export features are continuously being improved. See [API Documentation](https://www.databuddy.cc/docs/api) for current capabilities.

### Does Databuddy support real-time analytics?

Yes! The dashboard shows real-time data with minimal delay. You can see:
- Current active visitors
- Real-time page views
- Live event stream
- Current geographic distribution

### Can I track multiple websites?

Yes! You can:
- Create multiple websites in one account
- Each website gets a unique Client ID
- View analytics separately for each website
- Compare performance across websites

### Does Databuddy work with single-page applications (SPAs)?

Yes! Databuddy automatically tracks:
- React Router navigation
- Next.js page changes
- Vue Router navigation
- Any client-side routing when configured properly

See our [React](https://www.databuddy.cc/docs/react) and [Next.js](https://www.databuddy.cc/docs/nextjs) guides.

## Privacy & Compliance

### Is Databuddy GDPR compliant?

Yes! Databuddy is GDPR compliant by design:
- **No cookies**: Doesn't use cookies or localStorage for tracking
- **Anonymous tracking**: No personal data collected
- **No fingerprinting**: No device fingerprinting techniques
- **No cross-site tracking**: Isolated per-domain tracking
- **Data ownership**: You own your data
- **Right to deletion**: Easy data deletion
- **Transparent**: Open source code you can audit

See our [GDPR Compliance Guide](https://www.databuddy.cc/docs/compliance/gdpr-compliance-guide) for details.

### Do I need a cookie banner?

No! Because Databuddy doesn't use cookies or collect personal data, you don't need a cookie consent banner for analytics tracking in most jurisdictions. However, always consult with legal counsel for your specific situation.

### Where is my data stored?

**Cloud version:**
- Data stored in secure, SOC 2 compliant data centers
- Regular backups
- Encrypted at rest and in transit

**Self-hosted version:**
- You control where data is stored
- Can be hosted on-premises or your cloud provider
- Full data ownership

### Can I anonymize IP addresses?

Yes! IP addresses are automatically anonymized by default. You can configure the level of anonymization:
- **Full anonymization**: IP addresses not stored at all
- **Country level**: Only country information stored
- **City level**: City-level granularity (still anonymous)

See [Security Documentation](https://www.databuddy.cc/docs/security) for configuration options.

### Is my data secure?

Yes! Security measures include:
- **Encryption**: TLS/SSL for data in transit, AES-256 for data at rest
- **Authentication**: Secure session management
- **Access control**: Role-based access control (RBAC)
- **Regular audits**: Automated security scanning
- **Vulnerability reporting**: Responsible disclosure policy

See our [Security Policy](SECURITY.md) for reporting vulnerabilities.

## Technical Questions

### What technologies does Databuddy use?

**Core stack:**
- **Frontend**: Next.js 15, React 19, TypeScript 5.8
- **Backend**: Next.js API routes, tRPC
- **Databases**: PostgreSQL (app data), ClickHouse (analytics), Redis (cache)
- **Build**: Turborepo, Bun
- **Styling**: Tailwind CSS
- **UI**: Radix UI components

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for the complete technology stack.

### Can I self-host Databuddy?

Yes! Self-hosting is fully supported and encouraged. See our [Deployment Guide](DEPLOYMENT.md) for:
- Docker deployment (recommended)
- Manual installation
- Cloud deployment (AWS, DigitalOcean, etc.)
- Scaling considerations

### What databases does Databuddy require?

Three databases are required:
1. **PostgreSQL**: Application data (users, websites, settings)
2. **ClickHouse**: Analytics data (events, time-series data)
3. **Redis**: Caching and session management

All three can be run via Docker for easy setup.

### Does Databuddy scale?

Yes! Databuddy is built to scale:
- **Horizontal scaling**: Add more application instances
- **Database sharding**: ClickHouse supports distributed tables
- **Caching**: Redis reduces database load
- **Event batching**: Reduces API requests
- **Async processing**: Background jobs for heavy operations

See [Deployment Guide - Scaling Section](DEPLOYMENT.md#scaling--performance) for details.

### What's the bundle size impact?

**SDK bundle sizes:**
- **Core SDK**: ~8KB gzipped
- **React SDK**: ~12KB gzipped (including React integration)
- **Full SDK with all features**: ~15KB gzipped

**Performance impact:**
- Async loading (doesn't block page rendering)
- Event batching (reduces network requests)
- Minimal CPU usage
- No impact on Core Web Vitals

### Can I contribute to Databuddy?

Yes! We welcome contributions:
- **Code**: Bug fixes, features, improvements
- **Documentation**: Guides, examples, translations
- **Testing**: Bug reports, test coverage
- **Design**: UI/UX improvements
- **Community**: Help others in Discord

See our [Contributing Guide](CONTRIBUTING.md) to get started.

### How do I report bugs?

Report bugs via:
1. [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues) - Preferred for tracking
2. [Discord](https://discord.gg/JTk7a38tCZ) - For quick questions
3. [Email](mailto:support@databuddy.cc) - For sensitive issues

Please include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, versions)
- Error messages or screenshots

See [Troubleshooting Guide](TROUBLESHOOTING.md) for common issues before reporting.

## Pricing & Licensing

### Is Databuddy free?

**Open source version:** Yes, completely free
- Self-hosted
- Full features
- No usage limits
- Community support

**Cloud version:** Freemium model
- Free tier available
- Paid plans for higher usage
- Priority support on paid plans

Check our [pricing page](https://databuddy.cc/pricing) for current plans.

### What's the license?

Databuddy is licensed under AGPL-3.0 (GNU Affero General Public License v3.0).

**What this means:**
- ✅ Use for any purpose (personal, commercial)
- ✅ Modify the code
- ✅ Distribute copies
- ✅ Use as a service (SaaS)
- ⚠️ Must share modifications if you distribute
- ⚠️ Must share modifications if you provide as a service (network use)
- ⚠️ Must keep the same license

See [LICENSE](LICENSE) for full legal text.

### Can I use Databuddy for commercial projects?

Yes! The AGPL-3.0 license allows commercial use. Requirements:
- If you **use** Databuddy internally: No obligations
- If you **distribute** Databuddy: Share your modifications
- If you **offer Databuddy as a service**: Share your modifications

For proprietary/closed-source use cases, contact [enterprise@databuddy.cc](mailto:enterprise@databuddy.cc) for licensing options.

### Do you offer enterprise support?

Yes! Enterprise offerings include:
- Priority support (SLA-backed)
- Custom deployment assistance
- Training and onboarding
- Custom feature development
- Dedicated infrastructure
- Alternative licensing options

Contact [enterprise@databuddy.cc](mailto:enterprise@databuddy.cc) for details.

## Troubleshooting

### Why am I not seeing data in my dashboard?

Common causes:
1. **Client ID mismatch**: Verify your Client ID is correct
2. **Tracking disabled**: Check if tracking is disabled in development
3. **Ad blockers**: Some ad blockers may block analytics
4. **CORS issues**: Verify domain is whitelisted
5. **ClickHouse not running**: Check database status

See [Troubleshooting Guide - Tracking Issues](TROUBLESHOOTING.md#tracking-issues) for detailed solutions.

### Why is my dashboard loading slowly?

Possible causes:
- High data volume
- Missing database indexes
- Insufficient resources
- Network latency

See [Troubleshooting Guide - Performance Issues](TROUBLESHOOTING.md#performance-issues) for optimization tips.

### How do I debug tracking issues?

Enable debug mode:

```javascript
// In browser console
window.databuddy.debug = true

// Track test event
db.track('test', { source: 'debug' })

// Check network tab for requests to basket.databuddy.cc
```

See [Troubleshooting Guide](TROUBLESHOOTING.md) for comprehensive debugging steps.

### Where can I get help?

**Community support:**
- [Discord](https://discord.gg/JTk7a38tCZ) - Fastest for quick questions
- [GitHub Discussions](https://github.com/databuddy-analytics/Databuddy/discussions) - Q&A, ideas
- [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues) - Bug reports

**Documentation:**
- [Official Documentation](https://www.databuddy.cc/docs)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Deployment Guide](DEPLOYMENT.md)

**Direct support:**
- [support@databuddy.cc](mailto:support@databuddy.cc) - Email support
- [enterprise@databuddy.cc](mailto:enterprise@databuddy.cc) - Enterprise inquiries

---

## Still have questions?

If your question isn't answered here:
1. Check our [Documentation](https://www.databuddy.cc/docs)
2. Search [GitHub Issues](https://github.com/databuddy-analytics/Databuddy/issues)
3. Ask in [Discord](https://discord.gg/JTk7a38tCZ)
4. Open a [GitHub Discussion](https://github.com/databuddy-analytics/Databuddy/discussions)

We're here to help! 🚀
