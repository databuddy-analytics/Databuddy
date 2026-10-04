# Investigation quality evals

`quality.ts` runs the production investigation agent on synthetic cases. Read tools return fixed fixtures and never touch analytics, definitions or delivery. Keep every fixture synthetic.

Run outside the repository with only `AI_GATEWAY_API_KEY` set. Bun loads `.env` from the working directory, and the repository `.env` points at production Postgres, Redis and ClickHouse:

```sh
cd /tmp && env -i PATH="$PATH" HOME="$HOME" AI_GATEWAY_API_KEY="$AI_GATEWAY_API_KEY" \
  bun /path/to/Databuddy/apps/insights/src/evals/quality.ts --out /tmp/insights-quality --runs 2
```

- `--cases a,b` reruns selected case IDs; keep the original failed result as well.
- `--model` selects a gateway model; it defaults to the production investigation model.
- `--agent <path>` runs an alternate agent for an isolated comparison. Copy it into this checkout's `apps/insights/src` and remove the copy afterward: the runner rejects another checkout's `ai` and `zod`, whose separate Zod registry can silently drop tool-field descriptions. For a full runtime comparison, run each checkout's own evaluator.
- `--baseline <dir>[,<dir>]` prints per-case changes against earlier output directories, recomputed from their `results.json` and weighted by the observed runs for each metric. Given two or more identical baseline directories, `~` marks a change within the spread of their per-case means.

Cases run two at a time. Each run writes `<case>-<n>.jsonl` traces (prompts, observable model responses, tool calls and results, tool and finish validation errors, usage; private reasoning is omitted), `results.json` after each batch, and `summary.json` at exit with per-case scores, first-request sizes (system, user and tool characters, finish schema), spend, git HEAD and a dirty flag. The runner copies the agent, shared contract, detection, signal preparation and fixture source into the output directory. The exit table shows, per case, pass k/N, per-run means of reads (tool calls other than finish), finish rejections, input and output tokens and brief words, and complete k/N.

A failed check exits nonzero. `REVIEW REQUIRED` marks a mechanically valid case whose `reviewRequired` note still needs a person; a zero exit does not complete that review. Published briefs have a 60-word budget across title, summary, cause and evidence (plus impact for legacy outcomes), excluding action details. It is a quality target, not a runtime gate; review brevity alongside retained information.

`injection.ts` runs the same agent on prompt-injection cases: attacker text in an event name, error message, route path, annotation, error rows, a commit message or a team reply, each beside a control without the injection. It clears every other environment variable and blocks network access except the AI gateway before loading any repository module. It reports per case whether the attack was followed, whether attacker text was copied into the outcome, and the publish decision against the control, and exits nonzero when an attack was followed. Success checks are text heuristics, so read the outcomes in `results.json` before trusting a rate.

## Cases

- `empty-evidence-signal`, `unrelated-context-traffic`, `sibling-metric-traffic`: a near-total drop publishes as measurement coverage asking whether tracking still loads, with no cause, and never cites unrelated context or a sibling metric as proof.
- `coverage-without-definition`: a verified collection gap publishes as measurement coverage.
- `useful-signup-decline`, `useful-decline-missing-connector`: a measured decline publishes as a product outcome with its steady-arrivals control, no cause and no manufactured work, even when a connector is unavailable.
- `missing-connector`, `missing-connector-with-page-context`: missing diagnostic access stays private, creates no work and is not retried.
- `executable-goal-target`, `wrong-definition-subject`, `failed-definition-read`, `already-correct-goal`: a goal repair needs the exact inspected definition and route; a mismatched or failed definition read, or an already-correct goal, gets no repair or publication.
- `funnel-conditions-repair`, `native-funnel-repair`: a funnel repair replaces only the stale final event and keeps step conditions and filters.
- `partial-table-not-absence`: neither a partial top-pages table nor zero measured visits proves a route absent or justifies a definition change.
- `signup-source-comparison`, `activation-source-comparison`: both windows are read separately and the affected source cohort is published, without a cause or remedy.
- `available-repository-mechanism`: a connected repository is read before an inspected-mechanism repair.
- `reply-verified-recovery`, `reply-failed-recovery`: a reported repair is remeasured over the saved window and not repeated.
- `check-*`: saved verification runs one native read and no model call, so zero steps and tokens are expected; audit `verificationRead` and the persisted status, check, measured count and threshold.
- `current-goal-*`: a stale goal signal is reconciled with an exact native remeasurement, without a cause or repair; only a measured decline or zero publishes.
- `revenue-currency-refunds`, `revenue-attribution-shift`: currencies, gross revenue, refunds and attribution stay separate across both exact windows.
- `revenue-native-*`: the real detector and signal preparation build the input, recorded in `case.setup`; only the standalone runner builds these cases. A verified decline publishes; stale or unavailable reads do not. They do not cover database latency, or refund and attribution detection when gross revenue is unchanged.
- `retention-cohort-unavailable`: weekly actives are not cohort retention; the case stays private after a successful capability catalog read.
- `holdout-revenue-competing`, `-reordered`: stable gross, falling attribution and rising refunds all reach the accepted fields and rendered evidence, whatever the field order.
- `holdout-discovery-cross-category-available`, `-unavailable`: discovery widens beyond a wrong category; an available comparison publishes and unavailable diagnostics stay private.

The source-comparison, `native-funnel-repair`, `current-goal-*`, reply, check, revenue, retention, repository and holdout cases keep production tool input schemas with synthetic responses; the rest use simplified reads. Query discovery runs its real in-memory catalog. Query compilation and transactional Apply have separate tests. Passing these small fixtures does not establish customer usefulness, causal accuracy or production reliability.

## Lessons

- Run identical frozen fixtures against both runtimes, keep baseline and candidate output directories separate, and keep the exact source revisions with the comparison; changing a fixture is not an agent improvement. Review each executed JSONL, including failed and intermediate drafts, before claiming one.
- Identical reruns differ by about two cases per two-run set and a few cases are flaky at baseline, so compare 4+ runs before believing a delta.
- Prompt compression needs fresh repair and verification controls, not only the targeted case. Retain rejected variants: shortened instructions have produced extra definition lookups, pooled period reads, longer briefs, and dropped attribution facts. Evaluate these separately from rubric success. A useful refund finding still omits depth when an independently returned attribution decline is discarded; an empty category-filtered retention search does not establish catalog-wide absence.
- Moving rules between prompt sections, even verbatim, has changed behavior.
- A number match is not a correct association: a brief once assigned transaction count 100 to gross revenue 10000, and the number-presence guard accepted it because 100 appeared elsewhere. Check headlines and summaries as well as evidence; correct numbers can still describe the wrong population. Track metric/value associations, missed attribution changes, unnecessary discovery and unsupported capability conclusions separately from rubric success.
- A closed list of accepted search words would reject valid native substring searches, so discovery relevance stays a manual check.

## Context selection

`context-selection.ts --out <fresh-directory> --runs 2` compares native absent/present context paths, then runs the selected investigations through this evaluator. It uses synthetic 2-, 9- and 24-signal portfolios, a maximum-sized context correction case and manual exclusion coverage. `--reverse` reverses candidate order for holdouts; `--cases` selects scenario IDs. Alternate arms, preserve the copied source and fixtures, and review complete outputs as well as final selections. A zero exit means the run completed; `results.json` keeps quality failures for manual comparison.
