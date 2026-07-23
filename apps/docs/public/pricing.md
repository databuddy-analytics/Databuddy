# Databuddy Pricing

Product analytics, web analytics, feature flags, and Databunny AI analysis. Included monthly events and Databunny processing allowances; pay-as-you-go event overage on paid plans.

Machine-readable: [JSON](https://www.databuddy.cc/api/pricing) · static [Markdown](https://www.databuddy.cc/pricing.md) · **GET `/pricing`** with `Accept: text/markdown` (see `Vary: Accept`).

## Plans

| Plan | Price | Events / month (included) | Databunny usage allowance | Notes |
| --- | --- | --- | --- | --- |
| Free | $0 | 10,000 | 10 / month | No paid overage — ingestion pauses at the monthly event allowance |
| Hobby | $10/mo | 30,000 | 20 / month + 1 daily bonus | Tiered event overage |
| Pro | $50/mo | 1,000,000 | 350 / month + 5 daily bonus | Tiered event overage |
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

| | Free | Hobby | Pro | Enterprise |
| --- | --- | --- | --- | --- |
| Funnels | 1 | 5 | 50 | Unlimited |
| Goals | 2 | 10 | Unlimited | Unlimited |
| Feature flags | 3 | 10 | 100 | Unlimited |
| User tracking | Unlimited | Unlimited | Unlimited | Unlimited |
| Web Vitals | ✓ | ✓ | ✓ | ✓ |
| Geographic maps | ✓ | ✓ | ✓ | ✓ |
| Retention | ✓ | ✓ | ✓ | ✓ |
| Error tracking | — | ✓ | ✓ | ✓ |
| Databunny questions and analysis | ✓ | ✓ | ✓ | ✓ |
| Target groups | Unlimited | Unlimited | Unlimited | Unlimited |
| Team members | Unlimited | Unlimited | Unlimited | Unlimited |

## Databunny usage

Every cloud plan includes an AI processing allowance for Databunny questions and analysis. This is not a message quota: a simple question can use less of the allowance than deeper analysis. Hobby and Pro also receive a daily bonus that replenishes each day.

## Enterprise

Custom contracts for volume, compliance, onboarding, and support. Use [databuddy.cc/pricing](https://www.databuddy.cc/pricing) or your account contact.

## Definitions

- **Event:** A pageview, custom event, captured error, or Web Vital measurement counted toward monthly analytics usage. Feature flag evaluations and uptime checks do not count.
- **Databunny usage:** AI processing consumed by questions and analysis. It is not one unit per message; consumption depends on the work performed.
- **Overage:** Events in a billing month above the plan’s included events.

## Links

- Sign up: [app.databuddy.cc/register](https://app.databuddy.cc/register)
- Website: [databuddy.cc/pricing](https://www.databuddy.cc/pricing)
- JSON API: [databuddy.cc/api/pricing](https://www.databuddy.cc/api/pricing)
