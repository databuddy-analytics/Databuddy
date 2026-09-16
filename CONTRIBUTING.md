# Contributing to Databuddy

Thanks for helping make Databuddy better. Bug reports, docs fixes, and code
contributions are all welcome. For a new feature, open an issue first so we can
agree on the scope before you start.

Want to run your own instance? Follow the [self-hosting guide](README.md#self-hosting).
This guide is for working on Databuddy itself.

## Run locally

You'll need Docker Compose, Node.js 20+, and the Bun version pinned in
[`package.json`](package.json).

```bash
git clone --branch staging https://github.com/databuddy-analytics/Databuddy.git
cd Databuddy
bun install --frozen-lockfile
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` and `DATABUDDY_ENCRYPTION_KEY` to separate random values
in `.env`. The example database URLs match the local Docker services.

```bash
docker compose up -d
```

Once the databases are ready, create the schemas and start the app:

```bash
bun run db:push
bun run clickhouse:init
bun run dev:dashboard
```

Open [localhost:3000](http://localhost:3000). The dev command builds the SDK and
devtools for you. Add provider keys only for the features you're working on;
see [optional services](README.md#optional-services).

To explore with sample data, create a website, copy its ID from its settings,
and run `bun run db:seed YOUR_WEBSITE_ID 1000`.

## Check your changes

Run these from the repo root before pushing:

```bash
bun run lint
bun run check-types
bun run test
```

Use `bun run format` for formatting with Ultracite/Biome. Package scripts in
[`package.json`](package.json) and each app's `package.json` cover other tasks.
For changes to published packages, add a changeset with `bun run changeset`.

To check self-host initialization against disposable databases, run
`bash scripts/test-selfhost-init.sh`. It needs Docker Compose 2.24.4 or later and
creates and removes its own test databases.

## Open a pull request

1. Check open PRs for overlapping work. Start one focused branch from current `staging`:

   ```bash
   git switch staging
   git pull --ff-only origin staging
   git switch -c codex/short-description
   ```

2. Keep each branch and PR to one change that can be reviewed and reverted on its own. Use a separate worktree for parallel work; one person or agent should edit a branch at a time.
3. Commit by intent, with a scope: `fix(api): handle missing session`. Keep unrelated changes in separate commits and PRs.
4. Push early and open a draft against `staging`. Describe the problem, what changed, how you checked it, and any dependencies or overlaps.
5. Rebase onto current `origin/staging` before review. If that changes reviewed code, request fresh review. A feature-branch dependency needs the owner's agreement and `Depends on #…` in both PRs; merge the prerequisite first.
6. Mark the PR ready when checks pass. Wait for configured reviewers on the final commit, address every actionable comment, and resolve the review threads. Before merging, check again for pending reviews or unaddressed feedback; green CI alone isn't review approval.
7. After merge or closure, retire the branch and remove its finished worktree. Merged branches are deleted automatically; delete closed branches manually. Start fresh for the next change.

Keep code simple and type-safe, and use shared components and helpers where they
fit. [AGENTS.md](AGENTS.md) has the repository conventions and full workflow.

## Using AI tools

AI assistance is welcome. Disclose the tool and how you used it, and personally
review and test the result. AI-assisted PRs must reference an accepted issue.
Read [AI_POLICY.md](AI_POLICY.md) before contributing with AI.
