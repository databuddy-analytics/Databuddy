# Databuddy scan

Find places to add product analytics events in a Git repository, with live terminal progress.

```sh
npx @databuddy/scan --run
# or
bunx @databuddy/scan --run
```

Requires Git, Node.js 22+, and your own [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key in `AI_GATEWAY_API_KEY`, set in your shell or your repository's `.env`. Requests go from your machine to your Gateway account; Databuddy never sees your source. To run directly on Bun without Node, use `bunx --bun @databuddy/scan --run` (Bun 1.2+).

Run without `--run` to preview the number of eligible files without sending code. **`--run` sends included source code to Jev through your Vercel AI Gateway account**, requesting zero data retention. Provider charges may apply. The scanner reads tracked files from your working tree, including uncommitted edits; it excludes tests, examples, symlinks, unsupported files, and detected embedded secrets. Detection is not a guarantee that source contains no secrets.

```sh
npx @databuddy/scan --report             # Saved summary
npx @databuddy/scan --report --verbose   # Every flagged source location
npx @databuddy/scan --diagnostics        # Failures, retries and output quality
npx @databuddy/scan --fresh              # Scan again without reusing responses
npx @databuddy/scan --run --no-actions   # Review whole files instead of grouped actions
npx @databuddy/scan --help               # All options
```

Press Ctrl+C to save completed work. Repeat `--run` to resume using successful cached responses. Findings are potential gaps to review in source, not verified insertion points or automatically added events. Source context can miss shared tracking wrappers and callees.

Grouped action review is the default. It groups JavaScript/TypeScript action handlers with callback and persistence evidence, so a button and its mutation are evaluated together. Routine UI state changes and name-only helpers do not become independent candidates. Unresolved or oversized context is recorded with the finding; unsupported files fall back to whole-source review, and files that parse with no action are not reviewed at all (`--no-actions` reviews everything). On a 190-item labelled intersection, grouping raised covered precision from 51.6% to 93.9% (p=0.027) at 2.4x the speed. This is a bounded syntax analysis, not a complete call graph.

Results, response caches and request logs are stored under `$XDG_CACHE_HOME/databuddy/scan/<repository-hash>` or `~/.cache/databuddy/scan/<repository-hash>`. Use `--output=/path/to/results` to choose another location, or `--root=/path/to/repository` to scan elsewhere. Reports work offline; `--cache-only` replays matching responses without network access or writes.

Request logs contain timing, retries and provider error codes, without credentials, source bodies or raw provider error bodies. The private local inventory includes file paths, hashes and tracking-call snippets. `--json` writes the result to stdout without progress output; `--plain` disables terminal control codes.

For local development from the monorepo root:

```sh
bun ./scan.ts --run
bun run --cwd packages/scan build
bun run --cwd packages/scan check-types
bun run --cwd packages/scan test
bun run --cwd packages/scan eval:quality          # Offline extraction report
bun run --cwd packages/scan eval:quality --run    # Bounded live comparison
```

TypeScript source compiles to `dist/cli.js`. Commander handles arguments, Zod validates inputs and model responses, p-limit schedules requests, and Chalk/log-update render terminal progress. The npm package contains the compiled executable; users do not need to build it.

Quality tests use synthetic source to reproduce the reviewed misses, duplicate flags, noise, and ambiguous callbacks. They verify extraction and evidence, not model accuracy. The optional live comparison uses 20 previously reviewed Databuddy targets, keeps review labels out of prompts, and reports unmatched or ambiguous targets separately. This selected set is a regression check, not a whole-repository accuracy estimate. It sends source through the same Gateway account as a normal scan.

Grouping is the default, on a 190-item labelled intersection where it raised covered precision from 51.6% to 93.9% (McNemar p=0.027) at 2.4x the speed of whole-file review. `onValueChange`, `onCheckedChange` and `onSelect` seed a candidate only when the handler writes something, so a toggle that saves on change is reviewed while a field that feeds a form's submit is not. Known gap: docs-copy and upgrade controls still classify as operational.

Licensed under MIT; see [LICENSE](LICENSE).
