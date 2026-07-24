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
  → watch: keep a quiet recheck; update an existing case only
  → resolve: close an existing case or record the finding
  → resume investigations on new evidence or a human reply
```

One exact signal starts an agent turn. The Insights brief aggregates useful turns across websites and time.

## Agent context

The agent receives:

- the exact named subject, its definition and business description, comparison windows, and prior outcomes;
- website identity and the ability to inspect relevant pages before asking a person;
- relevant analytics, errors, sessions, funnels, goals, vitals, and revenue tools;
- connected repositories, deploys, commits, code search, and file reads;
- project instructions and durable corrections;
- human replies and open actions or PRs.

Tools are discoverable. There is no fixed first query, query family, receipt choreography, or two-read limit.

## Outcome contract

Every completed turn reports:

- **summary:** what happened;
- **impact:** who or what is affected, with measured scope when available;
- **root cause:** the known mechanism, or `unknown`;
- **evidence:** the few facts that support or contradict it;
- **publish:** whether this turn adds a new customer-relevant fact to Insights;
- **next:** exactly one outcome.

The next outcome is one of:

- `act` — exact change, target, and verification condition;
- `ask` — one self-contained question that says what the answer unlocks;
- `watch` — keep the backend-owned signal trigger active and state when to escalate;
- `resolve` — why no further work remains.

Outcomes may be updated repeatedly. They are operational state, not prose templates.

Customer copy names the exact goal, funnel, page, event, error, or campaign. It describes the operational change, never the detector, agent, evaluation, suppression decision, or other internal mechanics.

The Insights brief presents the title, summary, impact, cause, evidence, and measured signal. It does not expose `act | ask | watch | resolve` mechanics. An investigation presents its current next move and full timeline.

## Continuity

- A dashboard, Slack, or MCP reply resumes the same investigation.
- A GitHub comment or review resumes the agent working on that PR.
- A materially worse resolved signal reopens the same investigation with its prior outcomes.
- Corrections such as terminology, ownership, or known infrastructure become project memory.

`act` and `ask` may create a case and notify people. `watch` schedules another check without creating a new case. `resolve` closes an existing case.

## Actions and PRs

The agent may inspect code without write credentials. For a code action it returns a patch and verification plan. Databuddy validates and applies the patch, creates the branch and PR, records updates in the investigation, and resumes the agent on review feedback.

Only the outer boundary is deterministic: authorization, tenant scope, patch validation, approvals, idempotency, and delivery. Investigation strategy is not.

## Quality bars

- An insight is useful when it teaches the teammate something specific they would otherwise need to discover.
- An investigation is useful when the teammate can act without asking “what exactly should I do?”

Reject output that merely restates a percentage, invents a cause, asks for data Databuddy can read, gives a generic recommendation, or creates duplicate work.

Summary, impact, cause, and evidence each contribute a different fact. Routine or unchanged rechecks remain in internal history with `publish: false`.

When business meaning is missing, inspect the definition, site, events, and connected code first. If the remaining ambiguity changes the decision, ask one specific question that names the subject and proposes the most evidence-backed interpretation.

## Implementation constraint

Use `insight_observations` as the append-only Insights source and `analytics_insights` as the current investigation projection. An `act` or `ask` creates or reopens that projection; `watch` and `resolve` may update an open investigation but never create or reopen one. Keep one agent and one evidence/tool stack. Add storage only when this model cannot represent a real use case.
