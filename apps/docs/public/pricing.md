# Databuddy Pricing

Product analytics, web analytics, feature flags, and Databunny investigations. Business and Scale include monthly investigation allowances, with $1 per additional completed investigation billed monthly. Event overage and ordinary chat are separate.

Machine-readable: [JSON](https://www.databuddy.cc/api/pricing) · static [Markdown](https://www.databuddy.cc/pricing.md) · **GET `/pricing`** with `Accept: text/markdown` (see `Vary: Accept`).

## Plans

| Plan | Price | Events / month (included) | Investigations / month (included) | AI credits for ordinary chat | Notes |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | 10,000 | — | 10 / month | No paid overage — ingestion pauses at the monthly event allowance |
| Hobby | $9.99/mo | 30,000 | — | 20 / month + 1 daily bonus | Tiered event overage |
| Pro | $49.99/mo | 1,000,000 | — | 350 / month + 5 daily bonus | Tiered event overage |
| Business | $299/mo | 2,000,000 | 100 / month | 1,500 / month | Invite only. $1 per additional investigation, billed monthly; tiered event overage |
| Scale | $799/mo | 10,000,000 | 500 / month | 5,000 / month | Invite only. $1 per additional investigation, billed monthly; tiered event overage |
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

Pro includes 1,000,000 events, then charges $0.035 per 1,000 for its first 1,000,000 paid events (up to 2,000,000 total monthly events). Business includes 2,000,000 events and starts overage at $0.03 per 1,000, up to 10,000,000 total monthly events. Scale includes 10,000,000 events and starts overage at $0.02 per 1,000, up to 50,000,000 total monthly events.

The [JSON API](https://www.databuddy.cc/api/pricing) declares `overageTierBasis: "total_monthly_events"`: its `overageTiers.upTo` values are total monthly event ceilings, including the allowance, not cumulative paid overage. For exact monthly totals at your event volume, use the calculator on the [pricing page](https://www.databuddy.cc/pricing).

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

## Investigations — monthly allowance, $1 per extra

Business includes 100 completed investigations per month; Scale includes 500. Each additional completed investigation costs $1 and is billed monthly. Clarifications of the same question and verification after applying a proposed repair are included. New questions and separate fresh analysis are new investigations. Failed or incomplete work does not use your allowance. Automatic scheduled investigations remain exclusive to the invite-only Business and Scale plans.

For example, 125 completed investigations on Business use the 100 included investigations and add $25 to the monthly bill. The total is $324 before event overage, ordinary chat purchases and taxes. Existing prepaid investigation balances retain their original terms.

## AI credits and existing balances

Every cloud plan includes AI credits for ordinary Databunny chat. Hobby and Pro also receive a daily credit bonus. Existing credit balances, plan allowances, and purchased top-ups are preserved; they are not converted into monthly investigations. Existing subscriptions retain legacy investigation billing terms until they switch billing terms. AI credits remain available for chat.

Legacy AI credit purchases remain available for chat and grandfathered billing terms: a monthly booster and prepaid top-ups that do not expire. Credit refill settings apply to AI credits, not monthly investigation allowances.

## Enterprise

Custom contracts for volume, compliance, onboarding, and support. Use [databuddy.cc/pricing](https://www.databuddy.cc/pricing) or your account contact.

## Definitions

- **Event:** A pageview, custom event, captured error, or Web Vital measurement counted toward monthly analytics usage. Feature flag evaluations and uptime checks do not count.
- **Investigation:** One completed question, including same-question clarifications and verification of a proposed repair. Uses one monthly included investigation, then costs $1 per extra.
- **AI credits:** Usage credits for ordinary chat and investigations on legacy billing terms.
- **Overage:** Usage above the monthly included allowance. Events have tiered rates; completed investigations cost $1 each above the included amount.

## Links

- Sign up: [app.databuddy.cc/register](https://app.databuddy.cc/register)
- Website: [databuddy.cc/pricing](https://www.databuddy.cc/pricing)
- JSON API: [databuddy.cc/api/pricing](https://www.databuddy.cc/api/pricing)
