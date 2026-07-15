const REVENUE_STATE_RANK = `multiIf(
	status = 'refunded', 5,
	status = 'completed', 4,
	status = 'canceled', 3,
	status = 'failed', 2,
	1
)`;

const REVENUE_EVENT_UNIX = `greatest(
	toUInt64(toUnixTimestamp(created)),
	if(
		isValidJSON(metadata),
		JSONExtractUInt(metadata, 'stripe_event_created'),
		toUInt64(0)
	)
)`;

interface RevenueLatestCteOptions {
	candidateWhere?: string;
	name?: string;
	scope: string;
	source?: string;
}

/**
 * Collapses immutable MergeTree versions to one deterministic row per
 * provider transaction. Terminal state precedence is intentional: local
 * delivery order cannot regress a completed payment to failed/canceled, while
 * a refund still supersedes completion. Immutable provider event time then
 * orders versions within the same state, with synced_at used only as a
 * deterministic delivery-order fallback.
 *
 * This is a legacy defense for versions that still exist. ReplacingMergeTree
 * may already have discarded older same-key rows; current ingestion avoids
 * that loss by giving attempts, payments, and refunds immutable provider IDs.
 *
 * `scope` must identify the tenant (and may narrow to a transaction); apply
 * lifecycle fields such as `created` after this CTE so an older pending version
 * cannot leak back into a date range. `candidateWhere` can cheaply identify
 * relevant keys (for example with the created minmax index); every version of
 * those keys is still considered before filtering. `source` is an internal
 * test override and must always be a trusted table expression.
 */
export function revenueLatestCte({
	candidateWhere,
	name = "revenue_latest",
	scope,
	source = "analytics.revenue",
}: RevenueLatestCteOptions): string {
	const candidateKeys = candidateWhere
		? `
			AND (owner_id, provider, transaction_id) IN (
				SELECT owner_id, provider, transaction_id
				FROM ${source}
				WHERE ${scope}
					AND ${candidateWhere}
				GROUP BY owner_id, provider, transaction_id
			)`
		: "";
	return `${name} AS (
	SELECT
		owner_id,
		nullIf(latest_website_id, '') AS website_id,
		transaction_id,
		provider,
		latest.1 AS type,
		latest.2 AS status,
		latest.3 AS amount,
		latest.4 AS original_amount,
		latest.5 AS original_currency,
		latest.6 AS currency,
		nullIf(latest_anonymous_id, '') AS anonymous_id,
		nullIf(latest_session_id, '') AS session_id,
		latest_customer_id AS customer_id,
		nullIf(latest_product_id, '') AS product_id,
		nullIf(latest_product_name, '') AS product_name,
		latest_metadata AS metadata,
		latest.11 AS created,
		latest.12 AS synced_at,
		latest_profile_id AS profile_id
	FROM (
		SELECT
			owner_id,
			provider,
			transaction_id,
			argMax(
				tuple(
					type,
					status,
					amount,
					original_amount,
					original_currency,
					currency,
					customer_id,
					product_id,
					product_name,
					metadata,
					created,
					synced_at
				),
				tuple(_revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest,
			argMax(
				ifNull(website_id, ''),
				tuple(ifNull(website_id, '') != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_website_id,
			argMax(
				ifNull(anonymous_id, ''),
				tuple(ifNull(anonymous_id, '') != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_anonymous_id,
			argMax(
				ifNull(session_id, ''),
				tuple(ifNull(session_id, '') != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_session_id,
			argMax(
				customer_id,
				tuple(customer_id != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_customer_id,
			argMax(
				profile_id,
				tuple(profile_id != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_profile_id,
			argMax(
				ifNull(product_id, ''),
				tuple(ifNull(product_id, '') != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_product_id,
			argMax(
				ifNull(product_name, ''),
				tuple(ifNull(product_name, '') != '', _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_product_name,
			argMax(
				metadata,
				tuple(lengthUTF8(metadata), _revenue_state_rank, _revenue_event_unix, _revenue_source_unix, _revenue_identity_richness, _revenue_tiebreaker)
			) AS latest_metadata
		FROM (
			SELECT
				*,
				toUInt64(toUnixTimestamp(synced_at)) AS _revenue_source_unix,
				${REVENUE_STATE_RANK} AS _revenue_state_rank,
				${REVENUE_EVENT_UNIX} AS _revenue_event_unix,
				toUInt8(ifNull(website_id, '') != '')
					+ toUInt8(ifNull(anonymous_id, '') != '')
					+ toUInt8(ifNull(session_id, '') != '')
					+ toUInt8(customer_id != '')
					+ toUInt8(profile_id != '') AS _revenue_identity_richness,
				cityHash64(toString(tuple(
					website_id,
					type,
					status,
					amount,
					original_amount,
					original_currency,
					currency,
					anonymous_id,
					session_id,
					customer_id,
					product_id,
					product_name,
					metadata,
					created,
					profile_id
				))) AS _revenue_tiebreaker
			FROM ${source}
			WHERE ${scope}${candidateKeys}
		)
		GROUP BY owner_id, provider, transaction_id
	)
)`;
}
