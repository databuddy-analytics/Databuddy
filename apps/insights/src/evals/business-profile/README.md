# Bounded business-profile comparison

Run from the repository root after `bun install --frozen-lockfile`. The suite uses `createModelFromId("openai/gpt-5.6-terra")` and native `Output.object`. Invoking it makes paid provider calls. The four repository fixtures are synthetic. Public contents and all model artifacts belong outside git.

```sh
bun --env-file=/absolute/path/to/local/.env apps/insights/src/evals/business-profile/run.ts \
  --out /private/tmp/business-profile-unique-attempt
```

The default compares original sources, prose, qualified sourced claims, and exact quotations. Each arm gets identical source contents and downstream questions. Compression never sees questions or expected answers. Limits: eight sources of 12,000 characters, 16 facts, 600 factual words, 800 characters per quotation, eight unknowns, two simultaneous model calls, two repeats and 120 seconds per call. Automatic retries are disabled. Invalid briefs are retained and never silently repaired or sent downstream. Reusing output directories is rejected.

`trace.jsonl` records native inputs including the JSON schema, public responses, usage, warnings, errors and timers. Headers and private reasoning are omitted; reasoning token counts remain usage metadata. Each phase saves its exact prompt, output and validation. The manifest contains exact case inputs; harness snapshots preserve each variant. Provider failures, schema/quote/word validation, and downstream errors are distinct.

Use `--cases included-is-not-cap,later-team-correction`, `--strategies raw,prose,claims,quotes`, and `--repeats 2` to bound a run. `--input /outside/git/cases.json` adds cases matching `caseSchema`. `--cases` filters both built-in and external cases.

`--max-facts 20 --max-words 800 --guidance /outside/git/guidance.txt` creates a new selection variant with an explicit general coverage policy. Do not pool it with unchanged 16-fact/600-word repeats. Prose retains its 600-word prompt/schema target. `--concurrency 1` reserves a single model slot when coordinating parallel work. `--hybrid` supplies the brief plus **all original source contents** downstream. Without it, compact arms supply the brief and source metadata. Raw always supplies full sources.

To exercise production later, pass `--strategies adapter --adapter /outside/git/adapter.ts`. Export `compress({sources, model, maxFacts, maxWords, abortSignal})`, returning the production context/brief. Use the supplied instrumented model to preserve logging and concurrency limits. The adapter owns production-schema validation; eval strategy validation is not substituted. `--hybrid` remains available. Use `--context-adapter` when the adapter returns the complete production context: that object is passed downstream directly instead of being nested inside a brief. This allows the actual production projection and its original-source fallback to be evaluated. The runner itself never accesses storage or customer analytics.

## Fresh native public collection

```sh
BUSINESS_PROFILE_DOMAIN=example.com bun --env-file=/absolute/path/to/local/.env \
  apps/insights/src/evals/business-profile/collect.ts \
  /private/tmp/business-profile-collection-unique / /pricing /docs
```

The actual `readWebsitePage` uses an inert cache and `mutationMode: "dry-run"`, with two simultaneous reads and at most eight supplied paths. The current native provider implementation/deadline are unchanged. Exact tool I/O and public Firecrawl bodies are recorded without headers. Failed URLs remain in `pages.json`. This is manually selected collection, not automatic discovery; assess the production selector separately.

## Assessment

```sh
cd apps/insights
bun test src/evals/business-profile/contract.test.ts
```

The rubric checks explicit semantic decisions, answer completeness and citation IDs. Manually review explanations and source entailment: correct labels can contradict explanations, and valid IDs do not prove support. Track omissions, false claims and decision/explanation contradictions separately. Contiguous excerpts can omit crucial conditions. Known absence of a team decision differs from an unexamined unknown. Short-fixture briefs can exceed original-source size; use actual token counts.
