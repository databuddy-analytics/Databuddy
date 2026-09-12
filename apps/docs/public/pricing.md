# Databuddy Pricing

Product analytics, web analytics, feature flags, and Databunny investigations. Plans include monthly events and AI credits, with pay-as-you-go event overage on paid plans.

Machine-readable: [JSON](https://www.databuddy.cc/api/pricing) · static [Markdown](https://www.databuddy.cc/pricing.md) · **GET `/pricing`** with `Accept: text/markdown` (see `Vary: Accept`).

## Plans

| Plan | Price | Events / month (included) | AI credits | Notes |
| --- | --- | --- | --- | --- |
| Free | $0 | 10,000 | 10 / month | No paid overage — ingestion pauses at the monthly event allowance |
| Hobby | $9.99/mo | 30,000 | 20 / month + 1 daily bonus | Tiered event overage |
| Pro | $49.99/mo | 1,000,000 | 350 / month + 5 daily bonus | Tiered event overage |
| Business | $299/mo | 2,000,000 | 1,500 / month | Invite only. An always-on product investigator; tiered event overage |
| Scale | $799/mo | 10,000,000 | 5,000 / month | Invite only. More investigation capacity for higher traffic; tiered event overage |
| Enterprise | Custom | Custom | Custom | Volume, security, SLAs — [pricing page](https://www.databuddy.cc/pricing) |

## Events (overage on paid plans)

Overage = events **above** the monthly included amount. Cumulative overage is charged in bands (first band fills, then the next). Hobby and Pro use the same per-event rates, but the exact band boundaries differ slightly between plans.

| Cumulative overage (events) | $ / event | $ / 1,000 events |
| --- | --- | --- |
| 1st – 2,000,000 | $0.000035 | $0.035 |
| 2,000,001 – 10,000,000 | $0.00003 | $0.03 |
| 10,000,001 – 50,000,000 | $0.00002 | $0.02 |
| 50,000,001 – 250,000,000 | $0.000015 | $0.015 |
| 250,000,001+ | $0.00001 | $0.01 |

For exact monthly totals at your event volume, use the calculator on the [pricing page](https://www.databuddy.cc/pricing).

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

## Investigations — $1 each

$1 per completed investigation. Clarifications of the same question and verification after applying a proposed repair are included. New questions and separate fresh analysis are new investigations. Buy 1–1,000 investigations at a time; prepaid investigations do not expire. New base-plan versions include no bundled investigations. Automatic scheduled investigations remain exclusive to the invite-only Business and Scale plans.

## AI credits and existing balances

Every cloud plan includes AI credits for ordinary Databunny chat. Hobby and Pro also receive a daily credit bonus. Existing credit balances, plan allowances, and purchased top-ups are preserved; they are not converted into $1 investigations. Existing subscriptions retain legacy investigation billing terms until they buy investigations or switch to a new plan version. After opting in, AI credits remain available for chat.

Legacy AI credit purchases remain available for chat and grandfathered billing terms: a monthly booster and prepaid top-ups that do not expire. Credit refill and spend-limit settings apply to AI credits, not $1 investigation purchases.

## Enterprise

Custom contracts for volume, compliance, onboarding, and support. Use [databuddy.cc/pricing](https://www.databuddy.cc/pricing) or your account contact.

## Definitions

- **Event:** A pageview, custom event, captured error, or Web Vital measurement counted toward monthly analytics usage. Feature flag evaluations and uptime checks do not count.
- **Investigation:** One completed question, including same-question clarifications and verification of a proposed repair, for $1.
- **AI credits:** Usage credits for ordinary chat and investigations on legacy billing terms.
- **Overage:** Events in a billing month above the plan’s included events.

## Links

- Sign up: [app.databuddy.cc/register](https://app.databuddy.cc/register)
- Website: [databuddy.cc/pricing](https://www.databuddy.cc/pricing)
- JSON API: [databuddy.cc/api/pricing](https://www.databuddy.cc/api/pricing)
