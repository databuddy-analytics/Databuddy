# Investigation quality evals

Run from the repository root with `AI_GATEWAY_API_KEY` configured:

```sh
bun apps/insights/src/evals/quality.ts --out /tmp/insights-quality --runs 2
```

Use `--agent /absolute/path/to/another/checkout/apps/insights/src/agent.ts` to compare an existing checkout against the same fixtures. `--model` selects a gateway model; it defaults to the production investigation model. Keep baseline and candidate output directories separate. Use `--cases partial-table-not-absence,missing-connector` for a targeted rerun; preserve the original failed result as well.

These are six synthetic scenarios, with bounded concurrency of two. The supplied read tools return synthetic fixtures and never access analytics, mutate definitions, or deliver notifications. The runner records prompts, observable model responses, tool calls/results, retries, usage, outcomes, and rubric failures in local JSONL files. Private reasoning content is omitted. `results.json` is updated after each batch. A failed check makes the process exit nonzero.

The checks cover signal-only evidence, a verified collection gap, a useful product decline without a remedy, executable goal repair, partial tables, and an unavailable connector. They test agent behavior with simplified reads; query compilation and transactional Apply behavior have separate tests. Review the actual outputs as well: passing these small fixtures does not establish customer usefulness, causal accuracy, or production reliability. Use synthetic data only in this suite.
