#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
test_compose=$(mktemp)
test_env=$(mktemp)
project="databuddy-init-test-$$"

sed -E \
  -e 's/^IMAGE_TAG=$/IMAGE_TAG=selfhost-test/' \
  -e 's/^(POSTGRES_PASSWORD|CLICKHOUSE_PASSWORD|REDIS_PASSWORD|BETTER_AUTH_SECRET|DATABUDDY_ENCRYPTION_KEY)=$/\1=init_test_password/' \
  selfhost.env.example > "$test_env"

cat > "$test_compose" <<'EOF'
services:
  postgres:
    ports: !reset []
  clickhouse:
    ports: !reset []
  init:
    image: databuddy-init:selfhost-test
    pull_policy: never
EOF

compose() {
  local docker_env=("PATH=$PATH" "HOME=$HOME") name
  for name in "${!DOCKER_@}"; do
    docker_env+=("$name=${!name}")
  done
  # Keep Docker connection settings without leaking Compose overrides into the fixture.
  env -i "${docker_env[@]}" \
    docker compose --project-name "$project" --env-file "$test_env" \
    -f docker-compose.selfhost.yml -f "$test_compose" "$@"
}
cleanup() {
  compose down --volumes --remove-orphans
  rm -f "$test_compose" "$test_env"
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
