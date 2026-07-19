# Investigation Roadmap

[`SPEC.md`](./SPEC.md) is the product contract. This is direction, not a promise.

## Shipped foundation

- One signal enters one investigation agent with shared analytics and read-only code/deploy tools; one `act | ask | watch | resolve` outcome is saved in the existing observation timeline. The old bounded classifier, repair lifecycle, duplicate evidence stack, and synthetic evaluator are gone.
- Each finding now opens as a durable investigation: historical agent observations and human replies share one chronological case timeline.
- A web reply resumes the current same-signal case with durable history, re-checks current data, and appends the new outcome.
- The agent outcome controls delivery directly: `act` and `ask` notify, `watch` rechecks quietly, and `resolve` closes.

## Now

- Run representative historical production cases until root cause, impact, next action, and verification are consistently useful.
- Resume the same investigation from Slack replies.
- Key cases by exact error fingerprint, goal, or funnel step and link recurrences.

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
