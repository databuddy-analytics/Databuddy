# @databuddy/scan

Find the places in your codebase where a product analytics event is missing.

```sh
npx @databuddy/scan --run
```

Run it from inside any Git repository. No account or API key needed. Requires Node.js 22+ (or `bunx @databuddy/scan --run`).

```
  databuddy. / event scan

  Scan complete · 314 / 314 files · 1m 24s

  191 files to review
  Potential gaps · review the source
  app/billing/topup-card.tsx:135 · Button.onClick · missing · Payments
  app/settings/two-factor-dialog.tsx:403 · Button.onClick · missing · Setup & onboarding
  api/integrations/slack.ts:433 · get /slack/callback · missing · Integrations
```

## How it works

1. **Finds actions.** It parses your JavaScript and TypeScript and groups each user action with the code it triggers: a button with its mutation, a form with its submit, a route with its database write.
2. **Checks for existing tracking.** It builds an index of the events you already send, including ones fired by shared helpers and middleware.
3. **Ranks the gaps.** Each action is classified as missing, partial, already tracked, or not worth tracking, then ranked by product area and priority.

Findings are suggestions to review, not guaranteed insertion points. The scanner never edits your code.

## Commands

| Command | What it does |
| --- | --- |
| `npx @databuddy/scan` | Preview how many files will be scanned. Sends nothing. |
| `npx @databuddy/scan --run` | Scan, or resume an interrupted scan |
| `npx @databuddy/scan --report --verbose` | Show every finding from the last scan |
| `npx @databuddy/scan --diagnostics` | Show failures, retries and timing |
| `npx @databuddy/scan --run --fresh` | Scan again without reusing saved results |
| `npx @databuddy/scan --run --no-actions` | Review whole files instead of grouped actions |

Press Ctrl+C at any time; completed work is kept and `--run` picks up where it stopped. Add `--json` for machine-readable output, or see `--help` for everything else.

## What gets sent

`--run` sends the source of the files being scanned to Jev, the model that classifies it. Zero data retention is requested on every call.

- **By default**, requests go through Databuddy's scan API. It forwards source to Jev and does not store or log it. It also receives a random ID for the run, the CLI version and the scan mode, which we use to count scans. Nothing identifies you or your repository.
- **With your own key**, set `AI_GATEWAY_API_KEY` to a [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key and requests go straight from your machine to your account. Databuddy receives nothing.

Only files tracked by Git are read. Tests, examples, symlinks and files that look like they contain secrets are skipped; that detection is a safeguard, not a guarantee.

Results are saved locally under `~/.cache/databuddy/scan/`. Use `--output` to choose another folder.

## Contributing

From the Databuddy monorepo root:

```sh
bun ./scan.ts --run                          # Run from source
bun run --cwd packages/scan test             # Build and test
bun run --cwd packages/scan eval:quality     # Extraction audit against reviewed cases
```

## License

MIT
