# Better Auth 1.7 cutover runbook

This repository is upgrading from the currently locked Better Auth `1.6.11`
family to `1.7.1`. The application changes in this branch must be deployed only
after the account identity cutover below has completed in the target database.

This is intentionally an operator-run runbook. The repository currently uses
Drizzle schema push for PostgreSQL and does not have a checked-in PostgreSQL
migration runner. Do not use `bun run db:push` against staging or production for
this change: it cannot choose trusted issuers, migrate credential account IDs,
or stop on identity collisions.

## What changed in the application

- All directly used Better Auth packages are pinned to `1.7.1` together.
- `account.issuer` and the `(issuer, account_id)` unique index are represented
  in the Drizzle schema.
- The Redis rate-limit adapter now uses Better Auth 1.7's atomic `consume`
  contract. The existing Redis Lua sliding-window implementation remains the
  counter and continues to fail open on Redis outages as before.
- Account-specific selectors now use the local Better Auth account row ID.
  Provider account IDs remain display/token data, not selectors.
- The dashboard explicitly requests TOTP and narrows the new two-factor
  response before reading TOTP-only fields.
- The dashboard auth instance has a canonical `baseURL` from the environment-
  resolved dashboard URL, so callback and redirect URLs do not depend on a
  proxy's forwarded host.
- Databuddy's custom API-key MCP server is not Better Auth MCP and does not
  need the `@better-auth/mcp` migration.

## Required order

1. Prepare a staging database clone or snapshot. Never use customer data as a
   test fixture or paste account identifiers into tickets or logs.
2. Run the read-only preflight queries below and record only aggregate counts.
3. Stop authentication writes for the cutover window. This includes dashboard
   auth routes and any job or admin path that can insert or update `account`.
4. Take a database snapshot or an equivalent `pg_dump` of the `account` and
   `user` tables. Keep it until the post-deploy checks pass.
5. Add the nullable column and perform the backfill transaction below.
6. Resolve every unmapped provider and every identity collision. Do not
   continue while either query returns rows.
7. Set `issuer` to `NOT NULL` and create the unique identity index.
8. Run the postflight checks, then deploy the application and restart all
   dashboard instances together.
9. Run the smoke checks below before reopening auth writes.

## Read-only preflight

Run these against the intended database with a read-only role first:

```sql
SELECT provider_id, COUNT(*) AS account_count
FROM account
GROUP BY provider_id
ORDER BY provider_id;

SELECT COUNT(*) AS account_count,
       COUNT(*) FILTER (WHERE provider_id = 'credential') AS credential_count,
       COUNT(*) FILTER (WHERE provider_id = 'google') AS google_count,
       COUNT(*) FILTER (WHERE provider_id = 'github') AS github_count
FROM account;

SELECT COUNT(*) AS sso_provider_count
FROM sso_provider;
```

The current Databuddy provider map is:

| `provider_id` | `issuer` | `account_id` treatment |
| --- | --- | --- |
| `credential` | `local:credential` | Replace with the linked `user.id` |
| `google` | `https://accounts.google.com` | Keep the provider subject |
| `github` | `local:oauth:github` | Keep the provider account ID |
| SSO provider IDs | Exact `sso_provider.issuer` | Keep the verified provider subject |

If preflight finds any provider outside that map, stop and add an explicit
trusted mapping from its Better Auth configuration or provider metadata. Never
derive an issuer from email, display name, request input, or an authorization
URL.

For SSO, inspect each stored OIDC/SAML mapping before the cutover. Better Auth
1.7 uses the verified OIDC `sub` or signed SAML `NameID`; it no longer treats a
custom `mapping.id` as the account identity. If a stored provider configuration
has a custom identity mapping, stop and obtain a trusted subject mapping from
the identity provider before continuing. Remove the legacy mapping from the
provider configuration in the same controlled change.

## Additive backfill

Take the snapshot before this step. The first transaction is safe to retry if it
rolls back, but it must run while authentication writes are stopped.

```sql
BEGIN;

ALTER TABLE account ADD COLUMN IF NOT EXISTS issuer text;

-- Better Auth 1.7 uses the stable local user ID for credential accounts.
UPDATE account AS a
SET issuer = 'local:credential',
    account_id = u.id
FROM "user" AS u
WHERE a.provider_id = 'credential'
  AND a.user_id = u.id;

-- Built-in Google uses Google's stable issuer and subject.
UPDATE account
SET issuer = 'https://accounts.google.com'
WHERE provider_id = 'google'
  AND issuer IS NULL;

-- GitHub is OAuth without an issuer in Better Auth's provider definition.
UPDATE account
SET issuer = 'local:oauth:github'
WHERE provider_id = 'github'
  AND issuer IS NULL;

-- SSO account rows use the exact issuer stored with their SSO provider.
UPDATE account AS a
SET issuer = s.issuer
FROM sso_provider AS s
WHERE a.provider_id = s.provider_id
  AND a.issuer IS NULL;

-- Fail closed. An exception rolls back the entire backfill transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM account WHERE issuer IS NULL OR issuer = '') THEN
    RAISE EXCEPTION 'Better Auth 1.7 backfill left unmapped account identities';
  END IF;
END $$;

COMMIT;
```

After the transaction, run the following read-only checks. Do not delete or
merge rows automatically:

```sql
SELECT provider_id, COUNT(*) AS unmapped_count
FROM account
WHERE issuer IS NULL OR issuer = ''
GROUP BY provider_id;

SELECT issuer, account_id,
       COUNT(*) AS account_count,
       COUNT(DISTINCT user_id) AS user_count
FROM account
GROUP BY issuer, account_id
HAVING COUNT(*) > 1
ORDER BY account_count DESC, issuer, account_id;
```

Any collision is a hard stop. If duplicate rows belong to one user, reconcile
tokens, scopes, timestamps, and the provider configuration with the owner
before removing a duplicate. If a key belongs to multiple users, establish the
owner from trusted provider data. Never merge users by matching email alone.

## Finalize the identity constraint

Only after the unmapped and collision queries are empty:

```sql
ALTER TABLE account ALTER COLUMN issuer SET NOT NULL;

-- Run outside a transaction. The existing provider/account index remains in
-- place for compatibility and is intentionally not dropped in this upgrade.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  accounts_issuer_account_unique
  ON account (issuer, account_id);
```

Verify the definition rather than relying only on the index name:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'account'
  AND indexname IN (
    'accounts_provider_account_unique',
    'accounts_issuer_account_unique'
  )
ORDER BY indexname;

SELECT COUNT(*) AS missing_issuer_count
FROM account
WHERE issuer IS NULL;
```

The expected `missing_issuer_count` is `0`. If index creation fails, leave the
application on the pre-upgrade version, resolve the reported duplicate keys,
and retry the index step. Do not drop the old provider/account index as a
shortcut.

## Smoke checks before reopening writes

Use non-production test accounts and placeholders where possible:

- Password sign-up, sign-in, password reset, and sign-out.
- Google sign-in and GitHub sign-in; confirm both return to the configured
  dashboard origin.
- SSO sign-in for one OIDC/SAML provider, if configured in the environment.
- Account settings: list linked accounts, link a provider, and unlink exactly
  the selected account.
- Organization GitHub integration: connect, use the integration, and
  disconnect it.
- TOTP enrollment and verification; confirm no OTP enrollment path is used by
  the TOTP dialog.
- Magic-link and email-OTP sign-in, including an unconfirmed account, and
  confirm the expected cleanup/revocation behavior.
- A GitHub-backed AI tool request with an expired access token, confirming the
  refresh path selects the local account row ID.
- Concurrent auth requests against one rate-limit key, confirming the limit
  does not allow multiple stale-read passes.

## Rollback boundary

The application code is reversible with a normal deployment rollback, but the
credential `account_id` rewrite is an identity migration. Do not attempt a
blind down migration after the new application has created rows.

Before the new application is deployed, rollback means restoring the captured
`account` table snapshot (or restoring the original `account_id` values by
joining that snapshot on `account.id`), dropping the new index, and dropping
`issuer` only after the old application is serving again. If a post-deploy
rollback is required, restore the whole captured auth-table snapshot in a
maintenance window and deploy the matching old application version. Keep the
snapshot until the new version has passed the smoke checks.

References:

- [Better Auth 1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide)
- [Better Auth 1.7 release overview](https://better-auth.com/blog/1-7)
