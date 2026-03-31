# Databuddy Pricing

Product analytics, web analytics, feature flags, and an in-product AI assistant. Included monthly events and assistant message quotas; pay-as-you-go event overage on paid plans.

Machine-readable: [JSON](https://www.databuddy.cc/api/pricing) · static [Markdown](https://www.databuddy.cc/pricing.md) · **GET `/pricing`** with `Accept: text/markdown` (see `Vary: Accept`).

## Plans

| Plan | Price | Events / month (included) | Assistant messages / day | Notes |
| --- | --- | --- | --- | --- |
| Free | $0 | 10,000 | 5 | No paid overage — upgrade for more volume |
| Hobby | $10/mo | 30,000 | 10 | Tiered event overage |
| Pro | $50/mo | 1,000,000 | 75 | Tiered event overage |
| Enterprise | Custom | Custom | Custom | Volume, security, SLAs — [pricing page](https://www.databuddy.cc/pricing) |

## Events (overage on Hobby & Pro)

Overage = events **above** the monthly included amount. Cumulative overage is charged in bands (first band fills, then the next). Hobby and Pro share the same tier rates.

| Cumulative overage (events) | $ / event | $ / 1,000 events |
| --- | --- | --- |
| 1st – 2,000,000 | $0.000035 | $0.035 |
| 2,000,001 – 10,000,000 | $0.00003 | $0.03 |
| 10,000,001 – 50,000,000 | $0.00002 | $0.02 |
| 50,000,001 – 250,000,000 | $0.000015 | $0.015 |
| 250,000,001+ | $0.00001 | $0.01 |

### Example monthly totals (USD, illustrative)

- **Hobby**, 500,000 events: 470,000 overage in band 1 → ~$10 + (470,000 × $0.000035) ≈ **$26.45/mo**.
- **Pro**, 5,000,000 events: 4,000,000 overage → band 1 + band 2 → ~$50 + $70 + $60 = **$180/mo**.

## Product limits

Checkout **Enterprise** maps to **Scale** entitlements in-app (same column below).

| | Free | Hobby | Pro | Enterprise (Scale) |
| --- | --- | --- | --- | --- |
| Funnels | 1 | 5 | 50 | Unlimited |
| Goals | 2 | 10 | Unlimited | Unlimited |
| Feature flags | 3 | 10 | 100 | Unlimited |
| User tracking | Unlimited | Unlimited | Unlimited | Unlimited |
| Web Vitals | ✓ | ✓ | ✓ | ✓ |
| Geographic maps | ✓ | ✓ | ✓ | ✓ |
| Retention | — | ✓ | ✓ | ✓ |
| Error tracking | — | ✓ | ✓ | ✓ |
| AI assistant (chat) | ✓ | ✓ | ✓ | ✓ |
| Target groups | — | 5 | 25 | Unlimited |
| AI Agent | — | — | ✓ | ✓ |
| Team members | 2 | 5 | 25 | Unlimited |

## AI capabilities

| | Free | Hobby | Pro | Enterprise (Scale) |
| --- | --- | --- | --- | --- |
| Summarization | ✓ | ✓ | ✓ | ✓ |
| Workspace Q&A | ✓ | ✓ | ✓ | ✓ |
| Global search | — | ✓ | ✓ | ✓ |
| Auto insights | — | — | ✓ | ✓ |
| Anomaly detection | — | — | ✓ | ✓ |
| SQL tooling | — | — | ✓ | ✓ |
| Correlation engine | — | — | — | ✓ |

## Enterprise

Custom contracts for volume, compliance, onboarding, and support. Use [databuddy.cc/pricing](https://www.databuddy.cc/pricing) or your account contact.

## Definitions

- **Event:** Pageview or custom event counted toward monthly analytics usage.
- **Assistant message:** One user turn in the AI assistant; daily quota resets each calendar day.
- **Overage:** Events in a billing month above the plan’s included events.
- **Scale vs Enterprise:** Internal tier id is **scale**; **Enterprise** on billing uses Scale limits and capabilities.

## Links

- Sign up: [app.databuddy.cc/login](https://app.databuddy.cc/login)
- Website: [databuddy.cc/pricing](https://www.databuddy.cc/pricing)
- JSON API: [databuddy.cc/api/pricing](https://www.databuddy.cc/api/pricing)
