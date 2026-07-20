# Investigation Roadmap

[`SPEC.md`](./SPEC.md) is the product contract. This is direction, not a promise.

## Shipped foundation

- One signal enters one investigation agent with shared analytics and read-only code/deploy tools; one `act | ask | watch | resolve` outcome is saved in the existing observation timeline. The old bounded classifier, repair lifecycle, duplicate evidence stack, and synthetic evaluator are gone.
- Each signal now owns a durable investigation: historical agent observations and human replies share one chronological case timeline.
- Dashboard, Slack, and MCP replies enter the same durable reply path, resume the same-signal case, re-check current data, and append the new outcome.
- Scheduled revisits remeasure the same error, goal, funnel, or metric even after it falls below the detector threshold; recovered cases close instead of disappearing.
- The generic agent exposes the same `list | get | reply` investigation path, and recurring Slack updates stay in the original case thread.
- The agent outcome controls delivery directly: `act` and `ask` notify, `watch` rechecks quietly, and `resolve` closes.

## Now

- Use the read-only production shadow—not synthetic prose graders—until root cause, impact, next action, and verification are consistently useful.
- Preserve exact entity definitions and business meaning through detection, investigation, Slack, and the dashboard; research missing context before asking a teammate.
- During an investigation, propose missing goal or funnel meaning and capture it after user confirmation.

## Next

- Let the agent produce a patch and verification plan without write credentials.
- Have Databuddy validate the patch, open one linked PR, and resume on review events.
- Verify the signal after merge; resolve or reopen the case.

## Later

- One-click telemetry, deploy, ad, support, CRM, and infrastructure connectors.
- Cross-source grouping when several signals share a root cause.
- Approved campaign, configuration, and infrastructure actions.
- Project memory and evals learned from accepted, rejected, and corrected work.

## Not building

- Another generic analytics chat or digest.
- A diagnosis rule engine or a subsystem per action type.
- Automatic mutation before investigation quality is proven.
