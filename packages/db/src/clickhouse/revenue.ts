interface RevenueLatestCteOptions {
	candidateWhere?: string;
	name?: string;
	scope: string;
	source?: string;
}

/** Reads canonical provider rows after ClickHouse merges duplicate versions. */
export function buildRevenueLatestCte({
	candidateWhere,
	name = "revenue_latest",
	scope,
	source = "analytics.revenue",
}: RevenueLatestCteOptions): string {
	const where = [scope, candidateWhere].filter(Boolean).join("\n\t\tAND ");
	return `${name} AS (
	SELECT
		owner_id,
		nullIf(website_id, '') AS website_id,
		transaction_id,
		provider,
		type,
		status,
		amount,
		original_amount,
		original_currency,
		currency,
		nullIf(anonymous_id, '') AS anonymous_id,
		nullIf(session_id, '') AS session_id,
		customer_id,
		nullIf(product_id, '') AS product_id,
		nullIf(product_name, '') AS product_name,
		metadata,
		created,
		synced_at,
		profile_id
	FROM ${source} FINAL
	WHERE ${where}
)`;
}
