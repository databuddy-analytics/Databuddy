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

### Investigation price

A completed investigation costs **$1**. The billable unit is one explicitly started
analysis of a selected signal or new question, not the durable case that may hold
several analyses over time. The result can identify an action, ask a necessary
question, or establish that no action is needed. Failed, interrupted, and
inconclusive work is not a completed investigation.

Reserve one investigation before starting new analysis. Confirm that reservation
only after its complete result is saved and readable; release it when the work is
incomplete. Persist charge identity and settlement intent with the result so retries
and recovery reuse the same unit. Uncertain payment-provider responses remain
pending for reconciliation rather than starting a second charge.

Clarifications of the same question use its saved evidence and are included.
Verification after applying that investigation's proposed repair is also included.
A new question or separate fresh analysis requires an explicit accepted price;
the model must never decide whether a reply incurs a charge. Signal selection,
preparation, model turns, and internal retries do not add customer charges.

Autumn stores the new unit in a separate `investigation_runs` balance with a $1
prepaid purchase option. Existing credit balances, credit refills, and attached
legacy plans retain their terms until the customer adopts the new entitlement.
An exhausted fixed-price balance does not fall back to spending legacy credits.
Chat continues to use credits. Token usage and model costs remain internal
telemetry for fixed-price investigations and included replies.

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
one family. This does not reintroduce optional general work excluded by business-aware
selection. Candidate input is bounded by serialized size rather than a count cutoff;
the complete saved brief and newest relevant correction survive source budgeting, or
selection retains the conservative fallback. The portfolio is diversified across correlated subjects and survives a
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

Business context is a sourced brief shared across a website's investigations. Supermemory
stores bounded page excerpts and the original text of authorized team replies. A scan
loads its public profile once and recalls relevant explanations for each subject;
recent and exact-subject PostgreSQL replies remain available during indexing delays or
outages. Recalled meaning takes priority over unrelated recent conversation. Public
copy explains the offering and audience; it does not establish completed behavior from
an event name. Explicit team corrections, guesses, and historical metrics remain
distinct from current measured evidence.

Public excerpts expire after seven days; a missing profile reads the homepage and
exposes links plus site-scoped search for further inspection. Coverage is limited to
the pages actually read. Context snapshots retain source dates and are frozen with the
run, separately from its analytics cutoff. Organization, website, canonical domain,
and a scope start date bind shared memory. Routine edits preserve that scope; deletion
and real scope changes retire its documents. Authorized organization deletion retires
all website scopes before the database cascade, holding ownership and website locks
through deletion; failed retirement keeps the organization available for retry.
Reply acceptance and outcome persistence acquire website locks before investigation
locks. Legacy replies without an original scope
remain history rather than being relabeled as current business facts. Scope changes
during execution reject the old outcome before persistence.

Scheduled goal/funnel recovery checks and explicit Apply verification replies are deterministic: one exact native read verifies the saved subject, population, definition, full window, minimum sample and threshold without a model call. Code renders the result and keeps inconclusive checks private. An unfinished window preserves the case and saved check until midnight UTC after its inclusive end date; a completed check resolves without inventing another repair. Free-form human replies retain the investigation agent and their supplied context. Unsupported legacy population checks remain inconclusive without an aggregate read. Read inputs, results and failures remain observable. Other investigations use discoverable tools. There is no fixed first query, query family, receipt choreography, or two-read limit. Each investigation uses one tool loop with at most eight model turns, including a reserved final turn. It ends through `finish_investigation`, which validates the outcome and returns any repair error in the same conversation; at most three finish attempts are allowed. Supplied evidence and successful reads include exact citation references. Sufficient supplied evidence can finish immediately; requested reads must complete before finishing. The finish tool asks for sources and claims before the publication decision; code renders structured revenue claims and validates every claim against those sources before storing the existing text outcome. The agent does not restart the conversation to repair output.

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
- A clarification is anchored to the original observation and its saved successful
  tool results, including source descriptions and measurement constraints. This
  evidence survives history truncation and later reopening of the same case.
  The answer is stored on the reply without new data reads or case-state changes.
  Legacy results without saved evidence receive an honest explanation of that
  limitation; answering them never silently starts paid analysis.
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

Stop gathering when further reads cannot change the decision, while retaining established changes and controls that change its interpretation. An overview of the current subject can reveal independent business facts even when its headline metric is stable: stable gross revenue does not erase falling attribution or rising refunds. Prefer these distinct comparisons over redundant counts. Capability discovery can inspect a compact complete catalog, then retrieve the relevant query contract; an empty search in one category cannot establish that a capability is unavailable everywhere.

A detected signal is a snapshot. Conflicting current evidence must be reconciled against the same definition, population and measured dates; a current definition listing alone cannot validate old counts. Unresolved measurement conflicts remain private without an invented cause.

Summary, cause, and evidence each contribute a different fact. Routine or unchanged rechecks remain in internal history with `publish: false`. Raw website traffic is not a verified product outcome: it can publish only a measurement-coverage finding with cited collection or implementation evidence. Uncited context, goal listings, and sibling metrics cannot establish visitor loss; a product result belongs to its own signal and subject.

Missing diagnostic access alone is not a coverage finding. Publish a measured missing population or inspected tracking defect when it makes a specific decision unsafe; keep an unsupported explanation or unavailable connector in private history. Preserve independently verified product results and outages even when their cause is unknown. Briefs should fit 60 words across the title, summary, cause, and evidence (including impact for legacy records), with each fact stated once.

Customer impact stays explicit about coverage. Anonymous visitor identifiers, sessions, identified profiles, and profiles with prior attributed completed-payment history are different cohorts. Unknown payment status is never reported as non-paying, and payment history is not called an active subscription. Error exposure alone does not prove that a page broke, a task failed, or work was lost.

Saved activation/return comparisons retain their native definition, cohort boundaries, complete eligible-profile counts and activation-event identity coverage in the signal. Code supplies that dated comparison as one evidence entry; the agent interprets its business relevance and may add one distinct sourced control. The complete brief retains the same 60-word budget. Activation is first within each independent cohort, not first-ever, and return is measured within a fixed elapsed-hour horizon. The existing minimum of 50 eligible profiles per complete cohort remains unchanged. Legacy signals without this measurement remain readable. Investigations that query retention as supporting evidence use the same population rules: select two exact native results with `{retention: true}` and let code render their complete overall comparison. Published free-form retention tool claims are rejected. Truncated daily display rows do not invalidate a complete overall aggregate; an unrelated uncited retention read does not suppress an independently supported finding. Unsupported structured comparisons can resolve privately with code-rendered eligible and incomplete profile counts, without asserting a return rate or spending another correction turn. Quantity-only corrections identify the exact authoring fields to change while preserving valid evidence and references.

Validated daily activation cohorts are retained with the saved comparison, including exact sums to the weekly populations. Before the model runs, code may offer one exploratory contiguous activation-date contrast against corresponding prior-week dates and the remaining dates. All four pooled groups require at least 50 eligible profiles; the selected decline must meet the existing materiality thresholds and differ from the remainder by at least ten percentage points. This bounded exploration describes recorded differences, not onset, cause or statistical significance after selection. The agent can select `{retentionDetail: true}` as its one optional evidence entry, citing the signal; it neither recalculates the numbers nor re-queries selected dates, which would redefine cohort membership. Sparse or uniform results retain the aggregate without extra work. Raw daily rows are kept in the saved signal; the model receives the compact validated comparison. The complete brief remains under the same 60-word budget. A conflicting observed daily cell in the same saved population keeps the entire run private even when weekly totals match. Omitting the detail selector or rewriting it as prose cannot erase that conflict. Aggregate-only reads remain usable when no contradictory daily result has been observed.

A contradictory read of the exact saved retention population makes the current investigation private, even if the agent omits that read from its citations. Additional retention evidence must match the saved website, events, namespace, horizon, cohort dates and observation cutoff before publication. Retention quantities stay in the generated comparison; additional model prose may describe a qualitative discrepancy or a distinct non-retention fact. Conflicting counts require a fresh consistent investigation; model-selected citations cannot erase a contradictory measurement.

When measured coverage proves that missing Databuddy setup blocks a useful answer, the insight may recommend a backend-verified setup candidate and the decision it unlocks. Today, a material fully unlinked error cohort can produce an exact `identify()` candidate; custom-event advice requires a measured coverage gap or an inspected workflow. Customer-impact counts alone never justify a profile trait, revenue integration, or invented event. These are evidence-backed product recommendations, not generic onboarding tips.

When business meaning is missing, inspect the definition, site, events, and connected code first. Ambiguity alone does not open a case, and the customer should not have to invent a metric's purpose. Explain what a broad metric does measure and recommend a concrete edit, replacement, or cleanup only from inspected evidence. Do not recommend deletion merely because a description is missing. A definition that contradicts its configured purpose is broken tracking and becomes an action; an undescribed broad definition resolves when no material harm is proven. Ask only for a specific external fact that cannot be inspected and chooses between concrete next moves.

## Implementation constraint

Use `insight_observations` as the append-only Insights source and `analytics_insights` as the current investigation projection. An `act` or `ask` creates or reopens that projection. A complete fixed-price result may create a resolved projection so its paid answer remains readable even when no action is needed; it does not create an interruption or reopen work. Other `resolve` outcomes may update an open investigation but never create or reopen one. Recommendations are a read projection of the latest observation for each signal: standalone setup and measurement recommendations expire at their recheck time unless renewed, while definition recommendations also verify against the current definition. Keep one agent and one evidence/tool stack. Add storage only when this model cannot represent a real use case.

Exact error-customer joins run as a private, aggregate-only enrichment after the backend selects a signal. They return counts and coverage, never visitor, profile, session, payment, order, or request identifiers. Identity joins report same-window resolution explicitly; attributed completed-payment matches require the payment to predate the affected profile's first error and remain a lower bound.
