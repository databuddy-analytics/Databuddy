# @databuddy/scan

Find the places in your codebase where a product analytics event is missing.

```sh
npx @databuddy/scan
```

Run it inside a Git repository, or pass a path. No account or key. Node.js 22+, or `bunx @databuddy/scan`.

```
  databuddy. / event scan

  Scan complete · 191 files to review · 294 findings · 1m 24s

  app/billing/topup-card.tsx:135 · Button.onClick · missing · Payments
  app/settings/two-factor-dialog.tsx:403 · Button.onClick · missing · Setup & onboarding
  api/integrations/slack.ts:433 · get /slack/callback · missing · Integrations
```

## Where your code goes

The scan sends the source of the files it reviews to Databuddy's scan API (`api.databuddy.cc`), which classifies it with Jev under **zero data retention**. **Your source is never stored or logged.** The API only counts scans, using a random run ID, the CLI version and request sizes; nothing identifies you or your repository. The CLI prints where the source is going, with the number of files, before it sends anything.

- `--dry-run` lists exactly which files would be sent, and sends nothing.
- To keep source off Databuddy entirely, set `AI_GATEWAY_API_KEY` to your own [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) key. Requests then go straight to your account and Databuddy receives nothing.

Only Git-tracked files are read. Tests, examples, symlinks and files that look like they contain secrets are skipped.

## For agents

```sh
npx @databuddy/scan --json
```

Prints every finding with its file, line, coverage (`missing`, `partial`, `covered`), product area and priority. `summary.destination` and `summary.zeroDataRetention` state where the source went. The privacy notice goes to stderr, so stdout stays valid JSON.

## Options

| | |
| --- | --- |
| `[path]` | Repository to scan. Defaults to the current one. |
| `--dry-run` | List the files that would be sent. Sends nothing. |
| `--json` | Print results as JSON. |

Running again is fast: finished work is cached, and an interrupted scan resumes where it stopped. Findings are suggestions to review; the scanner never edits your code.

## Contributing

From the Databuddy monorepo root:

```sh
bun ./scan.ts                                # Run from source
bun run --cwd packages/scan test             # Build and test
bun run --cwd packages/scan eval:quality     # Extraction audit against reviewed cases
```

## License

MIT
