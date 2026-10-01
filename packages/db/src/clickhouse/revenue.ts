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
		latestNonEmpty("profile_id", "profile_id"),
		latestNonEmpty("product_name", "ifNull(product_name, '')"),
	].join(",\n\t\t\t\t");
}

export function linkedStripePaymentsCte(
	scope: string,
	name = "linked_payment_intents"
): string {
	const paymentIntentId = paymentIntentIdExpression();
	return `${name} AS (
		SELECT DISTINCT owner_id, ${paymentIntentId} AS payment_intent_id
		FROM analytics.revenue FINAL
		WHERE ${scope}
			AND provider = 'stripe'
			AND type IN ('sale', 'subscription') AND status = 'completed'
			AND JSONExtractString(metadata, 'stripe_record_kind') = 'money'
			AND JSONExtractString(metadata, 'stripe_invoice_id') != ''
			AND ${paymentIntentId} != ''
			AND transaction_id != ${paymentIntentId}
	)`;
}

export function canonicalStripePaymentCondition(
	alias: string,
	linkedPayments = "linked_payment_intents"
): string {
	return `NOT (
		${alias}.provider = 'stripe'
		AND startsWith(${alias}.transaction_id, 'pi_')
		AND (${alias}.owner_id, ${alias}.transaction_id) IN (
			SELECT owner_id, payment_intent_id FROM ${linkedPayments}
		)
	)`;
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
