#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
test_dir=$(mktemp -d)
project="databuddy-init-test-$$"
export IMAGE_TAG=selfhost-test
export POSTGRES_PASSWORD=init_test_password CLICKHOUSE_PASSWORD=init_test_password
export POSTGRES_USER=databuddy POSTGRES_DB=databuddy
export CLICKHOUSE_USER=default CLICKHOUSE_DB=databuddy_analytics
export REDIS_PASSWORD=unused BETTER_AUTH_SECRET=unused DATABUDDY_ENCRYPTION_KEY=unused
export IP_HASH_SALT=unused AI_GATEWAY_API_KEY=unused
export DASHBOARD_URL=http://example.com API_URL=http://api.example.com BASKET_URL=http://basket.example.com

cat > "$test_dir/compose.yml" <<EOF
services:
  postgres:
    container_name: ${project}-postgres
    ports: !reset []
  clickhouse:
    container_name: ${project}-clickhouse
    ports: !reset []
  init:
    image: databuddy-init:selfhost-test
    pull_policy: never
EOF

compose() {
  docker compose --project-name "$project" --env-file /dev/null \
    -f docker-compose.selfhost.yml -f "$test_dir/compose.yml" "$@"
}
cleanup() {
  compose down --volumes --remove-orphans
  rm -f "$test_dir/compose.yml"
  rmdir "$test_dir"
}
trap cleanup EXIT

docker build -f init.Dockerfile -t databuddy-init:selfhost-test .
compose run --rm init
test "$(compose exec -T postgres psql -U databuddy -d databuddy -Atc \
  "SELECT to_regclass('public.websites') IS NOT NULL AND to_regclass('public.user') IS NOT NULL")" = t
test "$(compose exec -T clickhouse clickhouse-client --password init_test_password --query \
  "SELECT count() FROM system.tables WHERE (database, name) IN (('analytics', 'events'), ('analytics', 'daily_pageviews_mv'), ('uptime', 'uptime_monitor'))")" = 3

# Reapplying the schema must also succeed.
compose run --rm init

# A database connection failure must fail the init command.
if compose run --rm --no-deps -e DATABASE_URL=postgres://databuddy:wrong@postgres:5432/databuddy init; then
  echo "Initialization incorrectly succeeded with invalid database credentials" >&2
  exit 1
fi
echo "Self-host initialization smoke test passed"
