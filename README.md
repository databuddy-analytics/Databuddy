# Databuddy

Understand how people use your product: where they come from, what they do, and
where they drop off. Use that insight to decide what to build or improve next.

- **Building a product?** [Try hosted Databuddy](https://app.databuddy.cc) or follow the [tracker setup guide](https://www.databuddy.cc/docs/getting-started).
- **Running your own stack?** Start with [self-hosting](#self-hosting) below.
- **Want to help build Databuddy?** Read the [contributor guide](CONTRIBUTING.md). Bug reports and docs fixes count too.

## Self-hosting

Run Databuddy on your server with Docker Compose. It sets `SELFHOST=true`, so
events go straight to ClickHouse, while hosted billing and Databuddy's own telemetry are disabled.
Email and AI are optional; see [optional services](#optional-services).

### Start your instance

These steps need a release with the `databuddy-init` image. None is published yet;
check [releases](https://github.com/databuddy-analytics/Databuddy/releases) before starting.
You'll need Git and Docker Compose for this setup.

```bash
git clone https://github.com/databuddy-analytics/Databuddy.git
cd Databuddy
git checkout YOUR_RELEASE_TAG
cp selfhost.env.example .env
```

In `.env`, set:

- `IMAGE_TAG` to the release you checked out.
- `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, and `REDIS_PASSWORD` to URL-safe passwords.
- `BETTER_AUTH_SECRET` and `DATABUDDY_ENCRYPTION_KEY` to separate random secrets.

The template includes local URLs. Compose supplies database connections,
`SELFHOST`, and browser settings; you don't need to repeat them in `.env`.

Generate each password and secret separately with `openssl rand -hex 32`.
Then start Databuddy:

```bash
# Start the databases and create their schemas
docker compose -f docker-compose.selfhost.yml run --rm init

# Build the dashboard for your URLs and start the apps
docker compose -f docker-compose.selfhost.yml up -d --build
```

Open your dashboard URL, create an account, and add your first website.
The stack includes the dashboard, API, Basket event collector, uptime worker,
and short-link service (port `2500`). Ports are configurable in `docker-compose.selfhost.yml`.

For a public instance, replace the template's local URLs with your HTTPS URLs.
Keep the dashboard and API on the same parent domain. Set `BETTER_AUTH_COOKIE_DOMAIN`, such as `.example.com`,
to share login across subdomains. Leave it empty for localhost. Rebuild the
dashboard after changing public URLs; they're part of its browser bundle.

No shared parent domain, such as a PaaS default domain like `*.up.railway.app`?
Leave `BETTER_AUTH_COOKIE_DOMAIN` empty and set the dashboard's `API_PROXY_URL`
to the API's internal URL, then rebuild; the dashboard serves the API on its own origin.
On a PaaS, build the dashboard from source with `dashboard.Dockerfile`; its URLs
are baked in at build time, so there is no prebuilt dashboard image.

### Optional services

- **Email:** For resets, invitations, and alerts, set `RESEND_API_KEY` and an `EMAIL_FROM` sender on your verified domain, such as `Databuddy <no-reply@example.com>`. Leave `ALERTS_EMAIL_FROM` empty to use the same sender. Once both email settings are configured, set `REQUIRE_EMAIL_VERIFICATION=true` to require verified accounts. Recreate the services after changes.
- **Social login:** Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, or `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Register your dashboard's `/api/auth/callback/google` or `/api/auth/callback/github` URL with the provider, then recreate the services. Sign-in options appear when configured; password sign-in works without email or social providers.
- **Insights:** Set `AI_GATEWAY_API_KEY` and `COMPOSE_PROFILES=insights` in `.env`, then rerun `docker compose -f docker-compose.selfhost.yml up -d --build`. Website research also needs `CONTEXT_DEV_API_KEY`.
- **Status pages:** Deploy [the status app](apps/status) separately with [Node, Bun, and dependencies](CONTRIBUTING.md#run-locally). From the repo root, set your API and status URLs before building:

  ```bash
  export NEXT_PUBLIC_SELFHOST=true
  export NEXT_PUBLIC_API_URL=https://api.example.com
  export NEXT_PUBLIC_STATUS_URL=https://status.example.com
  NODE_ENV=production bun run --cwd apps/status build
  NODE_ENV=production bun run --cwd apps/status start
  ```

  The app listens on port `3002`. Set the matching `STATUS_URL` in your Compose `.env` and rebuild the dashboard to enable public links.
- **DQL:** Requires separate setup: a restricted `dql_user` and `CLICKHOUSE_DQL_URL` passed to the API in Compose. Use HTTPS outside loopback and never use the application's admin credentials. See the [DQL setup script](packages/db/src/clickhouse/dql.ts).

Self-hosting is still evolving. If you get stuck, [tell us what happened](https://github.com/databuddy-analytics/Databuddy/issues) or ask in [Discord](https://discord.gg/JTk7a38tCZ).

### Upgrade your instance

Back up your databases and `.env`, check out the new release in the same directory,
and update `IMAGE_TAG`.
Keep your existing `DATABUDDY_ENCRYPTION_KEY` so stored data stays readable.
Pull the images, then apply PostgreSQL changes so you can review any prompts:

```bash
docker compose -f docker-compose.selfhost.yml pull --ignore-buildable
docker compose -f docker-compose.selfhost.yml pull init
docker compose -f docker-compose.selfhost.yml run --rm init bun run --cwd packages/db db:push
```

If you decline a change, stop the upgrade. After accepting the changes, create
any missing ClickHouse tables, views, columns, and indexes:

```bash
docker compose -f docker-compose.selfhost.yml run --rm init bun --cwd packages/db src/clickhouse/setup.ts
```

This adds what's missing but never changes or drops existing objects. Columns
and indexes are only added on single-node installs; with `CLICKHOUSE_CLUSTER`
set, apply them yourself. Apply any extra migrations in the release notes before
starting the updated apps with
`docker compose -f docker-compose.selfhost.yml up -d --build`.

## Stay in touch

[Docs](https://www.databuddy.cc/docs) · [Discord](https://discord.gg/JTk7a38tCZ) · [GitHub issues](https://github.com/databuddy-analytics/Databuddy/issues) · [Email](mailto:support@databuddy.cc)

Found a security issue? Please follow [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE), except `packages/scan` which is [MIT](packages/scan/LICENSE). Copyright (c) 2025 Databuddy Analytics, Inc.

[<img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />](https://vercel.com/oss)
