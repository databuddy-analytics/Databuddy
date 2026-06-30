# Databuddy Railway template seed

This is the source of truth for the Railway project we turn into the public self-host template.
Keep it boring: fewer services, readable names, shared variables, and no custom scripts unless the app truly needs them.

## Service layout

| Template service name | Source | Public domain | Purpose |
| --- | --- | --- | --- |
| `Dashboard` | GitHub repo + `dashboard.Dockerfile` | Yes, port `3000` | Web UI and Better Auth routes |
| `API` | `ghcr.io/databuddy-analytics/databuddy-api:latest` after CI publish, or repo + `api.Dockerfile` for seed testing | Yes, port `3001` | RPC/API, auth callbacks, AI, admin APIs |
| `Events` | `ghcr.io/databuddy-analytics/databuddy-basket:latest` | Yes, port `4000` | Analytics event ingestion/webhooks |
| `Init` | GitHub repo + `init.Dockerfile` | No | One-shot Postgres/ClickHouse schema setup |
| `Postgres` | Railway Postgres | No | Relational app data |
| `Redis` | Railway Redis | No | Cache, sessions, queues |
| `ClickHouse` | ClickHouse template/image with `/var/lib/clickhouse` volume | No | Analytics warehouse |
| `Links` | `ghcr.io/databuddy-analytics/databuddy-links:latest` | Optional, port `2500` | Short-link redirects/tracking |

Use `Events` as the display name instead of `basket` in the template UI. Users understand what it does.
Keep `Links` optional unless the template supports Databuddy Links out of the box.

## Icons and grouping

- Template icon: Databuddy mark.
- `Dashboard`: Databuddy/browser icon.
- `API`: server/API icon.
- `Events`: lightning/activity icon.
- `Postgres`, `Redis`, `ClickHouse`: official database icons.
- `Links`: link icon.

Place services left-to-right by user mental model:

```txt
Dashboard → API → Postgres
          ↘ Events → ClickHouse
             Redis shared by API/Events/Links
Links optional, below API
```

## Variable strategy

Prefer Railway references and shared variables. Do not copy generated secrets across services by hand.

### Shared variables

```txt
NODE_ENV=production
SELFHOST=true
REQUIRE_EMAIL_VERIFICATION=false
BETTER_AUTH_SECRET=${{secret(64)}}
```

### Dashboard

The dashboard must be built from the repo, not the prebuilt GHCR image, because Next.js bakes `NEXT_PUBLIC_*` values at build time.

```txt
RAILWAY_DOCKERFILE_PATH=dashboard.Dockerfile
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
BULLMQ_REDIS_URL=${{Redis.REDIS_URL}}
CLICKHOUSE_URL=${{ClickHouse.DATABASE_URL}}
BETTER_AUTH_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_SECRET=${{shared.BETTER_AUTH_SECRET}}
SELFHOST=${{shared.SELFHOST}}
REQUIRE_EMAIL_VERIFICATION=${{shared.REQUIRE_EMAIL_VERIFICATION}}
DASHBOARD_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
API_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
BASKET_URL=https://${{Events.RAILWAY_PUBLIC_DOMAIN}}
STATUS_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_APP_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_API_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_BASKET_URL=https://${{Events.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_STATUS_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
```

### API

Use the GHCR image once the template changes are published. During seed testing, build from the repo with `RAILWAY_DOCKERFILE_PATH=api.Dockerfile` so local template changes are included.

```txt
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
BULLMQ_REDIS_URL=${{Redis.REDIS_URL}}
CLICKHOUSE_URL=${{ClickHouse.DATABASE_URL}}
BETTER_AUTH_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_SECRET=${{shared.BETTER_AUTH_SECRET}}
SELFHOST=${{shared.SELFHOST}}
REQUIRE_EMAIL_VERIFICATION=${{shared.REQUIRE_EMAIL_VERIFICATION}}
DASHBOARD_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
API_URL=https://${{API.RAILWAY_PUBLIC_DOMAIN}}
API_CORS_ORIGINS=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
# Seed testing only when building API from repo:
# RAILWAY_DOCKERFILE_PATH=api.Dockerfile
BASKET_URL=https://${{Events.RAILWAY_PUBLIC_DOMAIN}}
AI_API_KEY=unset
RESEND_API_KEY=unset
EMAIL_FROM=Databuddy <no-reply@example.com>
ALERTS_EMAIL_FROM=Databuddy <alerts@example.com>
```

### Events

```txt
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CLICKHOUSE_URL=${{ClickHouse.DATABASE_URL}}
SELFHOST=${{shared.SELFHOST}}
```

### Init

Run once after Postgres and ClickHouse are available. It is safe to re-run after schema changes.

```txt
RAILWAY_DOCKERFILE_PATH=init.Dockerfile
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLICKHOUSE_URL=${{ClickHouse.DATABASE_URL}}
NODE_ENV=production
```

Command:

```bash
bun run --cwd packages/db db:push && bun --cwd packages/db src/clickhouse/setup.ts
```

### Links (optional)

```txt
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
APP_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
LINKS_ROOT_REDIRECT_URL=https://${{Dashboard.RAILWAY_PUBLIC_DOMAIN}}
```

## Health checks

- `Dashboard`: `/login`
- `API`: `/health`
- `Events`: `/health`
- `Links`: `/health`
- `ClickHouse`: `/ping`

## First-run schema setup

Use the `Init` service for first-run setup instead of asking users to run commands locally. It runs:

```bash
bun run --cwd packages/db db:push && bun --cwd packages/db src/clickhouse/setup.ts
```

Keep it as a manual one-shot service/job in Railway. Do not add custom wait loops or runtime migration logic to the app services unless Railway template testing proves it is necessary.
