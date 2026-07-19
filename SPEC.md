# Databuddy Investigations

## Product job

Databuddy finds an important change, explains what caused it and who it affects, recommends the exact next action, and stays with the problem until it is resolved.

The product is not an insight-card generator. It is an investigation and resolution loop.

> Checkout conversion fell after deploy `abc123`. Mobile sessions fail at the payment step because the new form no longer emits `payment_submitted`. Restore the event in `CheckoutForm.tsx`, then verify at least five completions in 24 hours.

## Principles

1. **Cases, not cards.** A finding is the latest state of a persistent investigation.
2. **Let the agent investigate.** Code owns identity, tenancy, measured facts, and side effects. The agent chooses what to inspect and which hypotheses to test.
3. **Change the situation.** A useful result proposes a concrete action, asks one answerable question, defines a watch trigger, or resolves the case.
4. **Keep the thread.** New evidence, human replies, recurrence, and PR activity continue the same investigation.
5. **Stay quiet.** Weak or duplicate signals do not become customer work.

## Core model

### Signal

A measured symptom with an exact entity, time window, baseline, and stable key. Examples: an error fingerprint, a broken funnel step, a goal with zero completions, or a campaign whose paid traffic stopped converting.

### Investigation

The durable customer object. It contains:

- one primary signal and related signals;
- current state: `open` or `resolved`; a watch outcome stays open with an exact trigger;
- findings, evidence, human messages, actions, and recurrence history;
- durable prior agent turns so follow-ups continue with the same case context.

### Action

An optional proposed change with an owner and a verification condition. A code action may become a patch and PR. Other actions may target tracking, a goal, a campaign, configuration, or operations.

Do not introduce another product object unless these three cannot represent a real use case.

## Loop

```text
detect signal
  → open or update investigation
  → inspect analytics, telemetry, history, deploys, and code
  → report findings
  → act | ask | watch | resolve
  → resume on new evidence or a human reply
  → verify the result
```

One exact signal starts the run. The agent does not choose from a bag of unrelated regressions.

## Agent context

The agent receives:

- the signal, exact comparison windows, and prior findings;
- relevant analytics, errors, sessions, funnels, goals, vitals, and revenue tools;
- connected repositories, deploys, commits, code search, and file reads;
- project instructions and durable corrections;
- human replies and open actions or PRs.

Tools are discoverable. There is no fixed first query, query family, receipt choreography, or two-read limit.

## Outcome contract

Every completed turn reports:

- **summary:** what happened;
- **impact:** who or what is affected, with measured scope when available;
- **root cause:** the most likely mechanism, or `unknown`;
- **evidence:** the few facts that support or contradict it;
- **confidence:** separate root-cause and impact confidence;
- **next:** exactly one outcome.

The next outcome is one of:

- `act` — exact change, target, owner, and verification condition;
- `ask` — one specific question, who can answer it, and what it unlocks;
- `watch` — keep the backend-owned signal trigger active and state when to escalate;
- `resolve` — why no further work remains.

Findings may be updated repeatedly. Outcomes are not prose templates; they are operational state.

## Continuity

- A web or Slack reply resumes the same investigation.
- A GitHub comment or review resumes the agent working on that PR.
- A materially worse resolved signal reopens the same investigation with its prior findings.
- Corrections such as terminology, ownership, or known infrastructure become project memory.

`act` and `ask` notify people. `watch` schedules another agent check without creating noise. `resolve` closes the case.

## Actions and PRs

The agent may inspect code without write credentials. For a code action it returns a patch and verification plan. Databuddy validates and applies the patch, creates the branch and PR, records updates in the investigation, and resumes the agent on review feedback.

Only the outer boundary is deterministic: authorization, tenant scope, patch validation, approvals, idempotency, and delivery. Investigation strategy is not.

## Quality bar

An investigation is useful when a teammate can act without opening another analytics tab or asking “what exactly should I do?”

Reject output that merely restates a percentage, invents a cause, asks for data Databuddy can read, gives a generic recommendation, or creates a duplicate case.

## Initial implementation constraint

Use the existing insight as the current investigation and observations as its agent timeline. Human replies are durable timeline events that resume that agent. Add more lifecycle storage only when PR events cannot fit this model; automated execution comes later.
