# Audit log policy

The product audit log is the tenant-scoped record of security-sensitive and
administrative activity. It is designed to answer who acted, what changed,
which durable target was affected, when it happened, where the request came
from, and whether the operation succeeded.

## Event contract

- Product actions use the vocabulary in `packages/shared/src/audit.ts`.
- Explicit mutation events are written with the business mutation in the same
  database transaction whenever both operations share a transaction.
- Non-transactional and legacy paths use the durable audit outbox as a retry
  boundary. The outbox is not the source of truth; it exists to prevent a
  transient ledger failure from silently losing an event.
- Actor and target display names are snapshots. They remain useful after a
  user, invitation, website, or key is renamed or deleted.
- Failed and denied operations are retained. They often carry more
  investigation value than routine successful reads.

## Privacy and access

- Sensitive fields are redacted before the audit payload is persisted or
  mirrored to evlog. Display-time masking is only a second safety net.
- Audit queries, event detail, and CSV export are organization-scoped and
  require the `audit_log` read permission.
- CSV export is bounded to 10,000 rows and records an `audit_log.exported`
  event so exports are themselves reviewable.

## Retention and immutability

The application does not currently run an audit-event purge job. Until the
database, backup, and legal-retention requirements are configured together,
the service must not claim a fixed regulatory retention period. Owners should
set an accessible baseline of at least one year, extend it for contract or
regulatory requirements, and document the deletion or crypto-shredding path.

Application code only inserts audit events; it does not expose update or
delete operations. Production Postgres enforces this independently: the
`audit_events_append_only_rows` and `audit_events_append_only_truncate`
triggers (function `audit_events_append_only()`, owned by `postgres`) reject
every UPDATE, DELETE, and TRUNCATE on `audit_events`, whatever the role. The
application role holds `pg_write_all_data`, which per-table REVOKEs cannot
narrow, so the triggers are the control. Only a table owner can disable them,
which is a DDL change. `db:push` does not create or remove triggers, so a new
database needs them installed by hand:

```sql
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
		USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER audit_events_append_only_rows
	BEFORE UPDATE OR DELETE ON audit_events
	FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_append_only_truncate
	BEFORE TRUNCATE ON audit_events
	FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
```

Monitoring DDL and privilege changes is still an operational follow-up.

## Review checklist

When adding a privileged operation:

1. Add or reuse a named action in the shared vocabulary.
2. Include a stable target ID and a human-readable snapshot where available.
3. Record the relevant before/after values, excluding secrets and tokens.
4. Cover success, failure, and denied paths.
5. Keep the event in the business transaction or route it through the outbox.
6. Add a queryable filter when investigators will need to narrow the event.
