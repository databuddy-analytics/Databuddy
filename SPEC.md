# Databuddy Intelligence

## Product job

Databuddy explains what changed and why it matters, then turns material problems into work that stays open until resolved.

It has two outputs:

- **Insights** are noteworthy discoveries worth reading: improvements, regressions, recoveries, patterns, and useful context. They do not require an action.
- **Investigations** are durable cases worth interrupting someone about. They own the action, question, recheck, and resolution history.

An insight can open or update an investigation. Investigations do not replace insights.

## Principles

1. **Show useful discoveries.** “Not worth interrupting someone” does not mean “not worth showing.”
2. **Promote work, do not manufacture it.** Only a material action or answerable question opens a new investigation.
3. **Keep one engine.** Detection, evidence, tools, and the agent serve both outputs.
4. **Keep the thread.** New evidence, replies, recurrence, and PR activity continue the same investigation.
5. **Stay quiet in interrupting channels.** Useful non-actionable findings stay in Insights; weak and duplicate findings stay out everywhere.

## Core model

### Signal

A measured change with an exact entity, comparison window, baseline, and stable key.

### Insight

An append-only explanation of one signal at one point in time. It names the subject, change, impact, known cause, and supporting facts. The Insights brief is a chronological view of these observations.

### Investigation

The durable work object for one signal. It has an `open` or `resolved` state plus observations, replies, actions, rechecks, and recurrence history.

### Action

An optional proposed change with a target and verification condition. A code action may become a patch and PR. Other actions may target tracking, a goal, a campaign, configuration, or operations.

## Loop

```text
detect signal
  → inspect analytics, telemetry, history, deploys, and code
  → append insight
  → act | ask: open or update investigation and notify
  → resolve: close an existing case or record the finding
  → resume investigations on new evidence or a human reply
```

One exact signal starts an agent turn. The Insights brief aggregates useful turns across websites and time.

A run may first freeze a small portfolio of distinct signals. Available sourced
business context and complete candidate definitions inform at most one bounded
model selection before subject recall and investigation. Unavailable or invalid
context retains the deterministic fallback; due rechecks and critical reliability
regressions retain priority even when the model selects none. Original measurement
constraints and the unverified planning rationale stay in the frozen objective.
Scheduled runs investigate at most two; a deliberate manual full scan investigates at
most five and covers a distinct eligible specialist family before taking extra work from
one family. The portfolio is diversified across correlated subjects and survives a
retry unchanged. Each selected signal still gets its own exact agent turn, durable
observation, and investigation history; a model does not manufacture a broad report
from ungrounded raw data.

## Agent context

The agent receives:

- the exact named subject, its definition and business description, comparison windows, and prior outcomes;
- website identity and the ability to inspect relevant pages before asking a person;
- relevant analytics, errors, sessions, funnels, goals, vitals, and revenue tools;
- connected repositories, deploys, commits, code search, and file reads;
- project instructions and durable corrections;
- human replies and open actions or PRs.

Business context has one canonical PostgreSQL record per website in
`website_business_contexts`: scoped original sources, observation/expiry dates,
a bounded business brief, refresh time and optimistic revision. Supermemory indexes
one derived brief per scope plus original authorized team replies. A recalled brief
only locates the current PostgreSQL record; provider summaries and obsolete index
revisions cannot replace it. Recent and exact-subject replies remain available during
indexing delays or outages. Public copy establishes what the business says, not
internal event semantics inferred from a name or verified customer behavior. Explicit
team corrections, guesses and historical metrics stay distinct from current evidence.

The brief explains the offering, customer, commercial access and path to value in
concise claims, each backed by exact passages kept separately from the explanation.
The model selects numbered passages; code attaches their original text without
asking the model to copy quotations or running a citation-repair loop. The cached
brief uses a stronger synthesis model; page selection and investigations keep their
existing model. This concentrates additional model cost in infrequent refreshes.
Claims may combine sources, but every citation must remain available and exact;
losing a qualification removes the whole claim. Original sources remain available
for verification. Brief-only decision quality is evaluated separately from the full
source packet; passing with originals does not establish useful compression.

An index acknowledgement requires a completed Supermemory document whose content
exactly matches the submitted brief. A read and optional write share a four-second
network deadline. Missing documents are created; changed completed documents are
replaced through the native update API. Pending ingestion is allowed to finish;
a later warm read verifies it without restarting it or doing model work. Identical
content may retain older provider revision metadata.

A cold profile reads the homepage and a bounded same-site map in parallel, chooses up
to seven additional pages in one model call, and builds an optional brief in one more.
Valid exact quotations orient the investigation; original page text remains available
because summaries can omit deciding qualifications. Sources are capped at eight public
pages plus eight recent replies (12,000 characters per page, 4,000 per reply); model
context has a 64,000-character source budget and reports omitted records. Warm runs
reuse PostgreSQL without web or model calls. Native production investigations retain
successful deeper reads once on exit; injected tools/models and ordinary dry-run
contexts do not write. Changed page content or replies invalidate the brief. Unchanged
fresh observations renew source dates without recompiling. Public pages expire after
seven days; refresh deadlines cannot outlive retained sources. Brief failures preserve
originals, index failures preserve PostgreSQL, and concurrent refreshes use revision
checks rather than extra agent loops. Profile preparation is bounded included service
overhead, logged separately from billed investigation model usage.

Coverage is limited to pages actually read. Run snapshots freeze source dates separately
from the analytics cutoff; the canonical table holds the latest profile, not revision
history. Organization, website, canonical domain and a scope start date bind persistence.
Routine edits preserve scope. Transfers, real domain changes and soft deletion invalidate
the canonical record; hard deletion cascades. Existing remote retirement checks still
hold ownership and website locks and retain the database state when retirement fails.
The additive table must be applied before deploying the updated worker or website service.
Reply acceptance and outcome persistence acquire website locks before investigation
locks. Legacy replies without an original scope
remain history rather than being relabeled as current business facts. Scope changes
during execution reject the old outcome before persistence.

Tools are discoverable. There is no fixed first query, query family, receipt choreography, or two-read limit. Each investigation uses one tool loop with at most eight model turns, including a reserved final turn. It ends through `finish_investigation`, which validates the outcome and returns any repair error in the same conversation; at most three finish attempts are allowed. Successful reads include exact citation references. The agent does not restart the conversation to repair output.

Native `revenue_overview` evidence selects a currency and metric fields from exact successful result references. Code renders labels, values, units, dates and differences for complete equal-duration comparison windows with the same website, timezone and filters, including fresh windows on a later recheck. The stored evidence remains text. This binds those numeric comparisons; other sources retain numeric grounding checks and every finding still needs semantic quality review.

## Outcome contract

Every completed turn reports:

- **summary:** what happened and who or what is affected, with measured scope when available; legacy impact paragraphs remain readable;
- **root cause:** the known mechanism, or `unknown`;
- **evidence:** one or two concise entries that support or contradict it, each citing all contributing supplied signals, provided context, prior verification conditions, or exact successful tool results; failed queries are limitations, and a partial table cannot establish absence;
- **publish:** whether this turn adds a new customer-relevant fact to Insights;
- **recommendation:** an optional useful next step that does not create a case; goal edits include the exact proposed name or description so the existing editor can review and apply them. A recommendation may also carry an evidence-backed goal or funnel draft, or explain the tracking needed before one is useful. Drafts open in the normal editable setup flow and are never created automatically;
- **next:** exactly one outcome.

The next outcome is one of:

- `act` — exact change, target, and verification condition;
- `ask` — one self-contained question that says what the answer unlocks;
- `resolve` — why no investigation needs to remain open, even if a recommendation remains.

Goal and funnel actions may save a structured verification check when the metric, dates, sample and grounded threshold are known. Databuddy binds the expected population to the inspected definition plus the proposed edit. Existing analytics tools return their actual definition, filters and inclusive UTC period; changed populations, shortened windows, unfinished periods and insufficient samples are inconclusive. Code determines whether that check passed, failed or remains inconclusive and writes the verification summary. It does not infer a check from legacy prose. A passed check verifies that condition, not an unmeasured downstream result. Other investigation strategy and next moves remain agent-owned.

Outcomes may be updated repeatedly. They are operational state, not prose templates.

Customer copy names the exact goal, funnel, page, event, error, or campaign. It describes the operational change, never the detector, agent, evaluation, suppression decision, or other internal mechanics.

The Insights brief reads like a short news report: headline, what happened, why it matters, why it happened when known, then evidence. It does not expose `act | ask | resolve` mechanics. An investigation presents the same factual hierarchy before its current next move and full timeline. Recommendations live in a separate concise view with the suggestion, its source context, and an existing review action when one is available; they are not investigation activity.

## Continuity

- A dashboard, Slack, or MCP reply resumes the same investigation.
- A GitHub comment or review resumes the agent working on that PR.
- A materially worse resolved signal reopens the same investigation with its prior outcomes.
- Corrections such as terminology, ownership, or known infrastructure become project memory.

`act` and `ask` may create a case and notify people. `resolve` closes an existing case.

## Actions and PRs

The agent may inspect code without write credentials. For a code action it returns a patch and verification plan. Databuddy validates and applies the patch, creates the branch and PR, records updates in the investigation, and resumes the agent on review feedback.

Only the outer boundary is deterministic: authorization, tenant scope, patch validation, approvals, idempotency, and delivery. Investigation strategy is not.

Goal and funnel repairs must match the signal's exact definition ID in the latest successful inspection. Proposal validation and Apply share the measurement-change checks: reject no-ops and preserve stored funnel step conditions. If inspection cannot verify that subject, resolve privately without a claimed cause; a same-named definition cannot justify a repair, coverage diagnosis, or customer question.

## Quality bars

- An insight is useful when it teaches the teammate something specific they would otherwise need to discover.
- An investigation is useful when the teammate can act without asking “what exactly should I do?”

Reject output that merely restates a percentage, invents a cause, asks for data Databuddy can read, gives a generic recommendation, or creates duplicate work.

A detected signal is a snapshot. Conflicting current evidence must be reconciled against the same definition, population and measured dates; a current definition listing alone cannot validate old counts. Unresolved measurement conflicts remain private without an invented cause.

Summary, cause, and evidence each contribute a different fact. Routine or unchanged rechecks remain in internal history with `publish: false`. Raw website traffic is not a verified product outcome: it can publish only a measurement-coverage finding with cited collection or implementation evidence. Uncited context, goal listings, and sibling metrics cannot establish visitor loss; a product result belongs to its own signal and subject.

Missing diagnostic access alone is not a coverage finding. Publish a measured missing population or inspected tracking defect when it makes a specific decision unsafe; keep an unsupported explanation or unavailable connector in private history. Preserve independently verified product results and outages even when their cause is unknown. Briefs should fit 60 words across the title, summary, cause, and evidence (including impact for legacy records), with each fact stated once.

Customer impact stays explicit about coverage. Anonymous visitor identifiers, sessions, identified profiles, and profiles with prior attributed completed-payment history are different cohorts. Unknown payment status is never reported as non-paying, and payment history is not called an active subscription. Error exposure alone does not prove that a page broke, a task failed, or work was lost.

When measured coverage proves that missing Databuddy setup blocks a useful answer, the insight may recommend a backend-verified setup candidate and the decision it unlocks. Today, a material fully unlinked error cohort can produce an exact `identify()` candidate; custom-event advice requires a measured coverage gap or an inspected workflow. Customer-impact counts alone never justify a profile trait, revenue integration, or invented event. These are evidence-backed product recommendations, not generic onboarding tips.

When business meaning is missing, inspect the definition, site, events, and connected code first. Ambiguity alone does not open a case, and the customer should not have to invent a metric's purpose. Explain what a broad metric does measure and recommend a concrete edit, replacement, or cleanup only from inspected evidence. Do not recommend deletion merely because a description is missing. A definition that contradicts its configured purpose is broken tracking and becomes an action; an undescribed broad definition resolves when no material harm is proven. Ask only for a specific external fact that cannot be inspected and chooses between concrete next moves.

## Implementation constraint

Use `insight_observations` as the append-only Insights source and `analytics_insights` as the current investigation projection. An `act` or `ask` creates or reopens that projection; `resolve` may update an open investigation but never creates or reopens one. Recommendations are a read projection of the latest observation for each signal: standalone setup and measurement recommendations expire at their recheck time unless renewed, while definition recommendations also verify against the current definition. Keep one agent and one evidence/tool stack. Add storage only when this model cannot represent a real use case.

Exact error-customer joins run as a private, aggregate-only enrichment after the backend selects a signal. They return counts and coverage, never visitor, profile, session, payment, order, or request identifiers. Identity joins report same-window resolution explicitly; attributed completed-payment matches require the payment to predate the affected profile's first error and remain a lower bound.
