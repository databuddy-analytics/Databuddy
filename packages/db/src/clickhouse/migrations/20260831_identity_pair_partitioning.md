# Identity pair map partitioning

The pair maps created on 2026-08-29 used `ORDER BY (client_id, key, identity_time)`
with no partition key. `identityPairMapCte` filters on `client_id` plus an
`identity_time` range, and with the key column ahead of the timestamp that range
can never prune: a 7 day window on the largest identity client read 999,444 rows
to match 455,696, and a 30 day window read exactly the same rows as all time.
Cost grew with a client's total identity history rather than the query window.

Applied to production 2026-08-31: recreate both tables with
`PARTITION BY toYYYYMM(identity_time)` and a time-leading sort key, backfill,
drop the four maps, swap the tables in one `RENAME`, recreate the maps against
the canonical names, then replay a 3 hour delta to cover the window where no map
was attached.

Measured on the largest identity client (988k pairs), 7 day window, columns
materialized: 999,444 rows / 140.6 MB before, 483,344 rows / 70 MB after
(2.07x). Partitioning alone was tested and rejected: it read slightly more rows
than the original because a client's pairs span every month anyway. The win
comes from the time-leading sort key; the partition key bounds how much a single
part can hold as history accumulates.

Verified byte-identical results across the swap on a fixed window
(`2026-08-01` to `2026-08-30`, largest client): 34,870 stitched visitors over
313,540 rows on both the old and new anon tables, and 28,307 sessions /
3,704 profiles on both session tables. Map freshness confirmed by watching
`max(identity_time)` advance after the swap.

`analytics.identity_anon_pairs_old` and `analytics.identity_session_pairs_old`
are retained for rollback and can be dropped once the new tables have a few days
of clean operation.
