#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
RUN_ID="${DATABUDDY_E2E_RUN_ID:-$(date +%Y%m%d%H%M%S)-$$}"
BASE_DSN="${DATABUDDY_E2E_BASE_DATABASE_URL:-postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy}"
KEEP_DB="${DATABUDDY_E2E_KEEP_DB:-false}"
START_CLICKHOUSE="${DATABUDDY_E2E_START_CLICKHOUSE:-true}"

cd "$ROOT_DIR"

wait_for_clickhouse() {
  local url="$1"
  local ping_url="${url%/*}/ping"

  for _ in {1..120}; do
    if curl -sf "$ping_url" >/dev/null; then
      return 0
    fi
    sleep 0.5
  done

  echo "ClickHouse did not become ready at $ping_url" >&2
  return 1
}

start_clickhouse() {
  if [[ "$START_CLICKHOUSE" != "true" ]]; then
    return
  fi

  if ! command -v docker >/dev/null; then
    echo "Docker is required to start ClickHouse for local E2E. Set DATABUDDY_E2E_START_CLICKHOUSE=false to skip." >&2
    exit 1
  fi

  docker compose up -d clickhouse >/dev/null
}

create_output="$(bun packages/db/scripts/e2e-db-lifecycle.ts create --base-dsn "$BASE_DSN" --run-id "$RUN_ID")"
eval "$create_output"
export DATABASE_URL DATABUDDY_E2E_DB_NAME
export DATABUDDY_E2E_RUN_ID="$RUN_ID"
export DATABUDDY_E2E_PORT="${DATABUDDY_E2E_PORT:-3300}"
export DATABUDDY_E2E_MODE="${DATABUDDY_E2E_MODE:-true}"
export DATABUDDY_E2E_TEST_KEY="${DATABUDDY_E2E_TEST_KEY:-databuddy-e2e-$RUN_ID}"
export CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://default:@localhost:8123/databuddy_analytics}"
export DATABUDDY_E2E_SEED_CLICKHOUSE="${DATABUDDY_E2E_SEED_CLICKHOUSE:-true}"
export DATABUDDY_E2E_CLICKHOUSE_EVENTS="${DATABUDDY_E2E_CLICKHOUSE_EVENTS:-250}"

cleanup() {
  if [[ "$KEEP_DB" == "true" ]]; then
    echo "Keeping E2E database: $DATABUDDY_E2E_DB_NAME"
    return
  fi
  bun packages/db/scripts/e2e-db-lifecycle.ts drop --base-dsn "$BASE_DSN" --db-name "$DATABUDDY_E2E_DB_NAME" >/dev/null || true
}
trap cleanup EXIT

start_clickhouse
wait_for_clickhouse "$CLICKHOUSE_URL"

bun run --cwd packages/db db:push
bun run --cwd packages/db clickhouse:init

if [[ "$#" -eq 0 ]]; then
  cat <<EOF
E2E database is ready.

export DATABASE_URL='$DATABASE_URL'
export DATABUDDY_E2E_DB_NAME='$DATABUDDY_E2E_DB_NAME'
export DATABUDDY_E2E_RUN_ID='$DATABUDDY_E2E_RUN_ID'
export DATABUDDY_E2E_PORT='$DATABUDDY_E2E_PORT'
export DATABUDDY_E2E_MODE='$DATABUDDY_E2E_MODE'
export DATABUDDY_E2E_TEST_KEY='$DATABUDDY_E2E_TEST_KEY'
export CLICKHOUSE_URL='$CLICKHOUSE_URL'
export DATABUDDY_E2E_SEED_CLICKHOUSE='$DATABUDDY_E2E_SEED_CLICKHOUSE'
export DATABUDDY_E2E_CLICKHOUSE_EVENTS='$DATABUDDY_E2E_CLICKHOUSE_EVENTS'

Pass a command to run it with these variables, for example:
  apps/dashboard/test/e2e/run-local.sh bun run --cwd apps/dashboard dev
EOF
  exit 0
fi

"$@"
