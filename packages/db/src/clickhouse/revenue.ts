export function paymentIntentIdExpression(alias = ""): string {
	const prefix = alias ? `${alias}.` : "";
	return `if(
	JSONExtractString(${prefix}metadata, 'stripe_payment_intent_id') != '',
	JSONExtractString(${prefix}metadata, 'stripe_payment_intent_id'),
	if(${prefix}provider = 'stripe' AND startsWith(${prefix}transaction_id, 'pi_'), ${prefix}transaction_id, '')
)`;
}

export function stripeContextAggregates(prefix = ""): string {
	const latestNonEmpty = (column: string, value: string) =>
		`argMaxIf(${value}, synced_at, ${value} != '') AS ${prefix}${column}`;
	return [
		latestNonEmpty("website_id", "ifNull(website_id, '')"),
		latestNonEmpty("anonymous_id", "ifNull(anonymous_id, '')"),
		latestNonEmpty("session_id", "ifNull(session_id, '')"),
		latestNonEmpty("customer_id", "customer_id"),
		latestNonEmpty("product_name", "ifNull(product_name, '')"),
	].join(",\n\t\t\t\t");
}

interface RevenueLatestCteOptions {
	candidateWhere?: string;
	name?: string;
	scope: string;
	source?: string;
}
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
