# Databuddy evals

Run agent benchmarks from the repo root so `.env` is loaded:

```bash
bun run eval -- --model deepseek/deepseek-v4-flash
bun run eval -- --model google/gemini-2.5-flash-lite --concurrency 5
bun run eval -- --model anthropic/claude-sonnet-4.6 --limit 5 --concurrency 5
```

Open the local benchmark UI:

```bash
bun run eval:ui
```

The UI shows all historical runs, trend lines per model, latest-model leaderboard, searchable case failures, and response/tool details.

Evaluate the real agent against read-only production history and write the anonymized report outside Git:

```bash
bun run eval:insights:production-shadow -- --confirm-read-only-production --limit=3 --offsets=30,7,0 --reference-time=2026-07-17T20:16:54.076Z --output=/tmp/insights-shadow.json
```

Postgres and ClickHouse reads are transaction- or connection-enforced read-only. Investigation connectors remain enabled and can refresh credentials or write caches. Reports use best-effort redaction and must stay outside Git.

The report includes cache-aware token usage and estimated USD cost for every
investigation that invoked the agent, plus total, minimum, maximum, and average
investigation cost. It uses production billing prices when available and the
eval catalog for explicitly priced eval-only models.

Compare saved runs:

```bash
bun run eval -- compare --model deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro,google/gemini-2.5-flash-lite --diff
bun run eval -- compare --filter budget
```

List model groups:

```bash
bun run eval -- models
bun run eval -- models --filter google
```

## Result retention

Each run is saved twice:

- `results/<model-slug>/latest.json` — easy pointer for dashboards and compare commands.
- `results/<model-slug>/runs/<timestamp>.json` — immutable history so benchmark data is not lost when `latest.json` changes.

Re-judging archives the previous result before overwriting the target file.

## Cost reporting

Agent cost is calculated from production billing or `src/costs.ts`. Published
cache-read and cache-write rates are used when the catalog has them. If a model
has no pricing entry, the run still works, but agent cost is reported as `$0`
with a warning. Add pricing before using cost numbers for model decisions.

For one-off models, set exact per-million token prices without editing code:

```bash
EVAL_PRICE_GOOGLE_GEMINI_2_5_FLASH_LITE_INPUT_PER_MTOKEN=0.10 \
EVAL_PRICE_GOOGLE_GEMINI_2_5_FLASH_LITE_OUTPUT_PER_MTOKEN=0.40 \
bun run eval -- --model google/gemini-2.5-flash-lite
```
