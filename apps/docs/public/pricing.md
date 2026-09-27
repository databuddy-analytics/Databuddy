# Databuddy Pricing

Start with analytics and a monthly AI credit allowance for Databunny chat. Business includes 100 investigations per month; Scale includes 250 and adds SSO, audit logs, and guided onboarding. Extra investigations cost $1 each, billed monthly, and do not draw from AI credits.

Machine-readable: [JSON](https://www.databuddy.cc/api/pricing) · static [Markdown](https://www.databuddy.cc/pricing.md) · **GET `/pricing`** with `Accept: text/markdown`.

## Plans

| Plan | Price | Events / month (included) | Investigations / month (included) | AI credits / month (included) | Notes |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 10,000 | — | 10 | No paid overage — ingestion pauses at the monthly event allowance |
| Hobby | $9.99/mo | 30,000 | — | 20 (plus 1 / day) | Tiered event overage |
| Pro | $49.99/mo | 1,000,000 | — | 350 (plus 5 / day) | Tiered event overage |
| Business | $299/mo | 2,000,000 | 100 / month | 1,500 | $1 per additional investigation, billed monthly; tiered event overage |
| Scale | $799/mo | 6,000,000 | 250 / month | 3,000 | Adds SSO, audit logs, and guided onboarding. $1 per additional investigation, billed monthly; tiered event overage |
| Enterprise | Custom | Custom | Custom | Custom | Volume, security, SLAs — [pricing page](https://www.databuddy.cc/pricing) |

## Events (overage on paid plans)

Overage = events **above** the monthly included amount. Usage is charged in bands (first band fills, then the next). The table below is the **Hobby example**, after its 30,000 included events; other plans have different paid band widths.

| Hobby cumulative overage (events) | $ / event | $ / 1,000 events |
| --- | --- | --- |
| 1st – 2,000,000 | $0.000035 | $0.035 |
| 2,000,001 – 10,000,000 | $0.00003 | $0.03 |
| 10,000,001 – 50,000,000 | $0.00002 | $0.02 |
| 50,000,001 – 250,000,000 | $0.000015 | $0.015 |
| 250,000,001+ | $0.00001 | $0.01 |

Pro includes 1,000,000 events, then charges $0.035 per 1,000 for its first 1,000,000 paid events (up to 2,000,000 total monthly events). Business includes 2,000,000 events and starts overage at $0.03 per 1,000, up to 10,000,000 total monthly events. Scale includes 6,000,000 events and starts overage at $0.03 per 1,000, up to 10,000,000 total monthly events.

The [JSON API](https://www.databuddy.cc/api/pricing) declares `overageTierBasis: "total_monthly_events"`: its `overageTiers.upTo` values are total monthly event ceilings, including the allowance, not cumulative paid overage. For exact monthly totals at your event volume, use the calculator on the [pricing page](https://www.databuddy.cc/pricing).

## Product limits

| | Free | Hobby | Pro | Business | Scale | Enterprise |
| --- | --- | --- | --- | --- | --- | --- |
| Funnels | 1 | 5 | 50 | Unlimited | Unlimited | Unlimited |
| Goals | 2 | 10 | Unlimited | Unlimited | Unlimited | Unlimited |
| Feature flags | 3 | 10 | 100 | Unlimited | Unlimited | Unlimited |
| Error tracking | — | Included | Included | Included | Included | Included |
| SSO and audit logs | — | — | — | — | Included | Included |

All plans include unlimited websites and team members, user tracking, Web Vitals, geographic maps, uptime monitoring, and API access.

## Investigations — monthly allowance, $1 per extra

Only completed investigations count. Same-question clarifications and repair checks are included.

For example, 125 completed investigations on Business use the 100 included investigations and add $25 to the monthly bill. The total is $324 before event overage and taxes.

## Enterprise

Custom volume, security, and support. [Contact us](https://www.databuddy.cc/contact).

## Definitions

- **Event:** A pageview, custom event, captured error, or Web Vital measurement counted toward monthly analytics usage. Feature flag evaluations and uptime checks do not count.
- **Investigation:** A completed analysis of one question.
- **AI credits:** The monthly allowance that pays for Databunny chat questions and answers about your analytics.
- **Overage:** Usage above the monthly included allowance. Events have tiered rates; completed investigations cost $1 each above the included amount.

## Links

- Free, Hobby, and Pro: [Get started](https://app.databuddy.cc/register)
- Business: [Get started](https://app.databuddy.cc/register?plan=intelligence)
- Scale: [Get started](https://app.databuddy.cc/register?plan=intelligence_scale)
- Website: [databuddy.cc/pricing](https://www.databuddy.cc/pricing)
- JSON API: [databuddy.cc/api/pricing](https://www.databuddy.cc/api/pricing)
