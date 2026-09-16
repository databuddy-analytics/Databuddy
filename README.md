# Databuddy

Understand how people use your product: where they come from, what they do, and
where they drop off. Use that insight to decide what to build or improve next.

- **Building a product?** [Try hosted Databuddy](https://app.databuddy.cc) or follow the [tracker setup guide](https://www.databuddy.cc/docs/getting-started).
- **Running your own stack?** Start with [self-hosting](#self-hosting) below.
- **Want to help build Databuddy?** Read the [contributor guide](CONTRIBUTING.md). Bug reports and docs fixes count too.

## Self-hosting

Run Databuddy on your server with Docker Compose. Core analytics works without
email, AI, or billing credentials. Some features need extra setup; see
[optional services](#optional-services).

### Start your instance

These steps need a release with the `databuddy-init` image. None is published yet;
check [releases](https://github.com/databuddy-analytics/Databuddy/releases) before starting.
You'll need Git and Docker Compose; Bun and Node are only needed for
[local development](CONTRIBUTING.md#run-locally).

```bash
git clone https://github.com/databuddy-analytics/Databuddy.git
cd Databuddy
git checkout YOUR_RELEASE_TAG
cp .env.example .env
```

In `.env`, set:

- `IMAGE_TAG` to the release you checked out.
- `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, and `REDIS_PASSWORD` to URL-safe passwords.
- `BETTER_AUTH_SECRET` and `DATABUDDY_ENCRYPTION_KEY` to separate random secrets.
- Your public URLs. For a local instance, use:

| Setting | Local value |
| --- | --- |
| `DASHBOARD_URL` | `http://localhost:3000` |
| `API_URL` | `http://localhost:3001` |
| `BASKET_URL` | `http://localhost:4000` |
| `LINKS_URL` (short links) | `http://localhost:2500` |

Generate each password and secret separately with `openssl rand -hex 32`.
Then start Databuddy:

```bash
# Start the databases and create their schemas
docker compose -f docker-compose.selfhost.yml run --rm init

# Build the dashboard for your URLs and start the apps
docker compose -f docker-compose.selfhost.yml up -d --build
```

Open your dashboard URL, create an account, and add your first website.
The stack includes the dashboard, API, Basket event collector, and short-link
service (port `2500`). Ports are configurable in `docker-compose.selfhost.yml`.

For a public instance, use HTTPS for all public URLs. Keep the dashboard and API
on the same parent domain. Set `BETTER_AUTH_COOKIE_DOMAIN`, such as `.example.com`,
to share login across subdomains. Leave it empty for localhost. Rebuild the
dashboard after changing public URLs; they're part of its browser bundle.

### Optional services

- **Email:** For resets, invitations, and alerts, set `RESEND_API_KEY` and an `EMAIL_FROM` sender on your verified domain, such as `Databuddy <no-reply@example.com>`. Leave `ALERTS_EMAIL_FROM` empty to use the same sender. Recreate the services after changes.
- **Insights:** Set `AI_GATEWAY_API_KEY`, `AUTUMN_SECRET_KEY`, and `COMPOSE_PROFILES=insights` in `.env`, then rerun `docker compose -f docker-compose.selfhost.yml up -d --build`. Your organization also needs an Autumn customer with investigation allowance or credits.
- **Billing-backed features:** Error analytics and creating goals, funnels, or feature flags still need Autumn. Billing screens can show errors without it.
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
any missing ClickHouse tables and views:

```bash
docker compose -f docker-compose.selfhost.yml run --rm init bun --cwd packages/db src/clickhouse/setup.ts
```

This creates missing objects; it doesn't update existing ones. Apply any extra
migrations in the release notes before starting the updated apps with
`docker compose -f docker-compose.selfhost.yml up -d --build`.

## Stay in touch

[Docs](https://www.databuddy.cc/docs) · [Discord](https://discord.gg/JTk7a38tCZ) · [GitHub issues](https://github.com/databuddy-analytics/Databuddy/issues) · [Email](mailto:support@databuddy.cc)

Found a security issue? Please follow [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE). Copyright (c) 2025 Databuddy Analytics, Inc.

[<img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />](https://vercel.com/oss)
