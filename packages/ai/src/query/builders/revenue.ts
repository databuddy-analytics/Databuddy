import { revenueLatestCte } from "@databuddy/db/clickhouse";
import { STRIPE_FAILURE_WEBHOOK_EVENTS } from "@databuddy/shared/stripe-webhooks";
import { Analytics } from "../../types/tables";
import { escapeLikePattern } from "../simple-builder";
import type { CustomSqlFn, Filter, SimpleQueryConfig } from "../types";

const STRIPE_FAILURE_EVENT_SQL = STRIPE_FAILURE_WEBHOOK_EVENTS.map(
	({ event }) => `'${event}'`
).join(",\n\t\t\t\t\t\t");

const REVENUE_FILTER_COLUMNS: Record<string, string> = {
	country: "country",
	region: "region",
	city: "city",
	browser_name: "browser_name",
	device_type: "device_type",
	os_name: "os_name",
	utm_source: "utm_source",
	utm_medium: "utm_medium",
	utm_campaign: "utm_campaign",
	referrer: "referrer_domain",
	path: "entry_path",
	provider: "revenue_provider",
	type: "type",
	currency: "currency",
};

const REVENUE_ALLOWED_FILTERS = ["currency", "provider", "type"];

function buildRevenueWhereClause(
	filters: Filter[] | undefined,
	extraConditions: string[] = []
): { whereClause: string; params: Record<string, Filter["value"]> } {
	const params: Record<string, Filter["value"]> = {};
	const conditions: string[] = [...extraConditions];

	filters?.forEach((filter, i) => {
		if (!filter || filter.having) {
			return;
		}
		const column = REVENUE_FILTER_COLUMNS[filter.field];
		if (!column) {
			return;
		}

		const key = `rf${i}`;
		const op = filter.op;

		if (op === "in" || op === "not_in") {
			const values = Array.isArray(filter.value)
				? filter.value
				: [filter.value];
			if (values.length === 0) {
				return;
			}
			params[key] = values.map((v) => String(v));
			conditions.push(
				`${column} ${op === "in" ? "IN" : "NOT IN"} {${key}:Array(String)}`
			);
			return;
		}

		if (op === "contains" || op === "not_contains") {
			params[key] = `%${escapeLikePattern(String(filter.value))}%`;
			conditions.push(
				`${column} ${op === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
			);
			return;
		}

		if (op === "starts_with") {
			params[key] = `${escapeLikePattern(String(filter.value))}%`;
			conditions.push(`${column} LIKE {${key}:String}`);
			return;
		}

		params[key] = String(filter.value);
		conditions.push(`${column} ${op === "ne" ? "!=" : "="} {${key}:String}`);
	});

	return {
		whereClause: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "",
		params,
	};
}

function buildCurrencyWhereClause(filters?: Filter[]): string {
	const conditions: string[] = [];
	filters?.forEach((filter, index) => {
		if (!filter || filter.having || filter.field !== "currency") {
			return;
		}
		const key = `rf${index}`;
		if (filter.op === "in" || filter.op === "not_in") {
			const values = Array.isArray(filter.value)
				? filter.value
				: [filter.value];
			if (values.length > 0) {
				conditions.push(
					`currency ${filter.op === "in" ? "IN" : "NOT IN"} {${key}:Array(String)}`
				);
			}
			return;
		}
		if (filter.op === "contains" || filter.op === "not_contains") {
			conditions.push(
				`currency ${filter.op === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
			);
			return;
		}
		if (filter.op === "starts_with") {
			conditions.push(`currency LIKE {${key}:String}`);
			return;
		}
		conditions.push(
			`currency ${filter.op === "ne" ? "!=" : "="} {${key}:String}`
		);
	});
	return conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
}

function isOrgScope(filterParams?: Record<string, Filter["value"]>): boolean {
	return filterParams?.__orgLevel === "true";
}

function buildAttributionCte(
	filterParams?: Record<string, Filter["value"]>
): string {
	const orgScope = isOrgScope(filterParams);
	const directScope = orgScope
		? "(owner_id = {organizationId:String} OR website_id IN {websiteIds:Array(String)})"
		: "(owner_id = {websiteId:String} OR website_id = {websiteId:String})";
	const eventScope = orgScope
		? "client_id IN {websiteIds:Array(String)}"
		: "client_id = {websiteId:String}";
	const relatedInvoiceScope = `(
		${directScope}
		OR (
			provider = 'stripe'
			AND JSONExtractString(metadata, 'stripe_invoice_id') != ''
			AND (owner_id, JSONExtractString(metadata, 'stripe_invoice_id')) IN (
				SELECT owner_id, invoice_id FROM scoped_stripe_invoice_keys
			)
		)
	)`;
	const attributedWebsiteScope = orgScope
		? "1"
		: `(r.owner_id = {websiteId:String}
			OR r.website_id = {websiteId:String}
			OR r.linked_website_id = {websiteId:String})`;

	return `
			legacy_pi_dedup AS (
			SELECT amount, toUnixTimestamp(created) as ts, customer_id
			FROM ${Analytics.revenue}
			WHERE
				${directScope}
				AND created >= toDateTime({startDate:String})
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND provider = 'stripe'
				AND startsWith(transaction_id, 'pi_')
				AND type != 'subscription_event'
				AND status = 'completed'
				AND amount > 0
					AND customer_id != ''
			),
			scoped_stripe_invoice_keys AS (
				SELECT DISTINCT
					owner_id,
					if(
						JSONExtractString(metadata, 'stripe_invoice_id') != '',
						JSONExtractString(metadata, 'stripe_invoice_id'),
						transaction_id
					) AS invoice_id
				FROM ${Analytics.revenue}
				WHERE ${directScope}
					AND created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
					AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND provider = 'stripe'
					AND (
						JSONExtractString(metadata, 'stripe_invoice_id') != ''
						OR startsWith(transaction_id, 'in_')
					)
					AND (
						JSONExtractString(metadata, 'stripe_record_kind') IN ('link', 'money')
						OR JSONExtractString(metadata, 'databuddy_revenue_model') = 'stripe_invoice_v2'
					)
			),
			${revenueLatestCte({
				candidateWhere: `created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
					AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))`,
				name: "revenue_latest_range",
				scope: relatedInvoiceScope,
			})},
			stripe_relation_rows AS (
			SELECT
				owner_id,
				if(
					JSONExtractString(metadata, 'stripe_invoice_id') != '',
					JSONExtractString(metadata, 'stripe_invoice_id'),
					transaction_id
				) AS invoice_id,
					JSONExtractString(metadata, 'stripe_payment_intent_id') AS payment_intent_id,
					ifNull(website_id, '') AS context_website_id,
					ifNull(anonymous_id, '') AS context_anonymous_id,
					ifNull(session_id, '') AS context_session_id,
					customer_id AS context_customer_id,
					ifNull(product_name, '') AS context_product_name,
					synced_at
				FROM ${Analytics.revenue}
				WHERE ${relatedInvoiceScope}
				AND created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND provider = 'stripe'
				AND (
					JSONExtractString(metadata, 'stripe_invoice_id') != ''
					OR startsWith(transaction_id, 'in_')
				)
				AND (
					JSONExtractString(metadata, 'stripe_record_kind') IN ('link', 'money')
					OR JSONExtractString(metadata, 'databuddy_revenue_model') = 'stripe_invoice_v2'
				)
		),
		linked_payment_intents AS (
			SELECT DISTINCT
				payment_intent_id
			FROM stripe_relation_rows
			WHERE payment_intent_id != ''
		),
		stripe_payment_context_rows AS (
			SELECT
				owner_id,
				if(
					JSONExtractString(metadata, 'stripe_payment_intent_id') != '',
					JSONExtractString(metadata, 'stripe_payment_intent_id'),
					if(startsWith(transaction_id, 'pi_'), transaction_id, '')
					) AS payment_intent_id,
					ifNull(website_id, '') AS context_website_id,
					ifNull(anonymous_id, '') AS context_anonymous_id,
					ifNull(session_id, '') AS context_session_id,
					customer_id AS context_customer_id,
					ifNull(product_name, '') AS context_product_name,
					synced_at
				FROM ${Analytics.revenue}
				WHERE ${relatedInvoiceScope}
				AND created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND provider = 'stripe'
				AND (
					JSONExtractString(metadata, 'stripe_payment_intent_id') != ''
					OR startsWith(transaction_id, 'pi_')
				)
		),
		stripe_payment_context AS (
			SELECT
					owner_id,
					payment_intent_id,
					argMaxIf(context_website_id, synced_at, context_website_id != '') AS website_id,
					argMaxIf(context_anonymous_id, synced_at, context_anonymous_id != '') AS anonymous_id,
					argMaxIf(context_session_id, synced_at, context_session_id != '') AS session_id,
					argMaxIf(context_customer_id, synced_at, context_customer_id != '') AS customer_id,
					argMaxIf(context_product_name, synced_at, context_product_name != '') AS product_name
			FROM stripe_payment_context_rows
			WHERE payment_intent_id != ''
			GROUP BY owner_id, payment_intent_id
		),
		stripe_invoice_context_rows AS (
			SELECT
					owner_id,
					invoice_id,
					context_website_id,
					context_anonymous_id,
					context_session_id,
					context_customer_id,
					context_product_name,
					synced_at
			FROM stripe_relation_rows
			UNION ALL
			SELECT
					relation.owner_id,
					relation.invoice_id,
					payment.website_id AS context_website_id,
					payment.anonymous_id AS context_anonymous_id,
					payment.session_id AS context_session_id,
					payment.customer_id AS context_customer_id,
					payment.product_name AS context_product_name,
					relation.synced_at
			FROM stripe_relation_rows relation
			INNER JOIN stripe_payment_context payment
				ON payment.owner_id = relation.owner_id
				AND payment.payment_intent_id = relation.payment_intent_id
		),
		stripe_invoice_context AS (
			SELECT
					owner_id,
					invoice_id,
					argMaxIf(context_website_id, synced_at, context_website_id != '') AS website_id,
					argMaxIf(context_anonymous_id, synced_at, context_anonymous_id != '') AS anonymous_id,
					argMaxIf(context_session_id, synced_at, context_session_id != '') AS session_id,
					argMaxIf(context_customer_id, synced_at, context_customer_id != '') AS customer_id,
					argMaxIf(context_product_name, synced_at, context_product_name != '') AS product_name
			FROM stripe_invoice_context_rows
			WHERE invoice_id != ''
			GROUP BY owner_id, invoice_id
		),
		stripe_payment_attempt_rows AS (
			SELECT
				transaction_id AS attempt_id,
				multiIf(
					JSONExtractString(metadata, 'stripe_payment_intent_id') != '',
					concat('pi:', JSONExtractString(metadata, 'stripe_payment_intent_id')),
					JSONExtractString(metadata, 'stripe_invoice_id') != '',
					concat('in:', JSONExtractString(metadata, 'stripe_invoice_id')),
					concat('event:', transaction_id)
				) AS attempt_key,
				JSONExtractString(metadata, 'stripe_event_type') AS event_type,
				JSONExtractString(metadata, 'stripe_invoice_id') AS invoice_id,
				coalesce(
					nullIf(JSONExtractString(metadata, 'stripe_failure_decline_code'), ''),
					nullIf(JSONExtractString(metadata, 'stripe_failure_code'), ''),
					nullIf(JSONExtractString(metadata, 'stripe_failure_type'), ''),
					''
				) AS failure_reason,
				multiIf(
					JSONExtractString(metadata, 'stripe_failure_decline_code') != '', 3,
					JSONExtractString(metadata, 'stripe_failure_code') != '', 2,
					JSONExtractString(metadata, 'stripe_failure_type') != '', 1,
					0
				) AS failure_reason_rank,
				JSONExtractString(metadata, 'stripe_cancellation_reason') AS cancellation_reason,
				status,
				amount,
				currency,
				created,
				synced_at
			FROM ${Analytics.revenue}
			WHERE ${directScope}
				AND provider = 'stripe'
				AND type = 'subscription_event'
				AND JSONExtractString(metadata, 'stripe_record_kind') = 'attempt'
				AND created >= toDateTime({startDate:String})
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
		),
		stripe_payment_attempt_candidates AS (
			SELECT
				attempt_id,
				latest.1 AS attempt_key,
				latest.2 AS event_type,
				latest.3 AS invoice_id,
				latest.4 AS status,
				latest.5 AS currency,
				latest.6 AS amount,
				latest.7 AS failure_reason,
				latest.8 AS failure_reason_rank,
				latest.9 AS cancellation_reason
			FROM (
				SELECT
					attempt_id,
					argMax(
						tuple(
							attempt_key,
							event_type,
							invoice_id,
							status,
							currency,
							amount,
							failure_reason,
							failure_reason_rank,
							cancellation_reason
						),
						tuple(
							toUnixTimestamp(synced_at),
							cityHash64(toString(tuple(
								attempt_key,
								event_type,
								invoice_id,
								status,
								currency,
								amount,
								failure_reason,
								failure_reason_rank,
								cancellation_reason
							)))
						)
					) AS latest
				FROM stripe_payment_attempt_rows
				GROUP BY attempt_id
			)
		),
		stripe_invoice_failure_keys AS (
			SELECT DISTINCT invoice_id
			FROM stripe_payment_attempt_candidates
			WHERE event_type = 'invoice.payment_failed' AND invoice_id != ''
		),
		stripe_invoice_failure_attempt_keys AS (
			SELECT DISTINCT attempt_key
			FROM stripe_payment_attempt_candidates
			WHERE event_type = 'invoice.payment_failed'
		),
		stripe_payment_failure_reasons AS (
			SELECT
				attempt_key,
				argMax(
					failure_reason,
					tuple(failure_reason_rank, attempt_id)
				) AS failure_reason
			FROM stripe_payment_attempt_candidates
			GROUP BY attempt_key
		),
		stripe_failure_observations AS (
			SELECT
				currency,
				uniqExactIf(
					event_type,
					status = 'failed'
					AND event_type IN (
						${STRIPE_FAILURE_EVENT_SQL}
					)
				) AS observed_failure_event_types
			FROM stripe_payment_attempt_candidates
			GROUP BY currency
		),
		stripe_payment_attempts AS (
			SELECT
				attempt.attempt_id,
				attempt.attempt_key,
				attempt.event_type,
				family.failure_reason AS failure_reason,
				attempt.cancellation_reason,
				attempt.status,
				attempt.currency,
				attempt.amount
			FROM stripe_payment_attempt_candidates attempt
			LEFT JOIN stripe_payment_failure_reasons family USING (attempt_key)
			WHERE NOT (
				attempt.event_type = 'payment_intent.payment_failed'
				AND (
					attempt.attempt_key IN (SELECT attempt_key FROM stripe_invoice_failure_attempt_keys)
					OR attempt.invoice_id IN (SELECT invoice_id FROM stripe_invoice_failure_keys)
				)
			)
		),
			revenue_with_invoice_context AS (
				SELECT
					r.*,
					r.owner_id AS reconciliation_owner_id,
					coalesce(
						nullIf(invoice_context.website_id, ''),
						nullIf(payment_context.website_id, '')
					) AS linked_website_id,
					coalesce(
					nullIf(invoice_context.anonymous_id, ''),
					nullIf(payment_context.anonymous_id, '')
				) AS linked_anonymous_id,
				coalesce(
					nullIf(invoice_context.session_id, ''),
					nullIf(payment_context.session_id, '')
				) AS linked_session_id,
					coalesce(
						nullIf(invoice_context.customer_id, ''),
						nullIf(payment_context.customer_id, '')
					) AS linked_customer_id,
					coalesce(
						nullIf(invoice_context.product_name, ''),
						nullIf(payment_context.product_name, '')
					) AS linked_product_name
			FROM revenue_latest_range r
			LEFT JOIN stripe_invoice_context invoice_context
				ON invoice_context.owner_id = r.owner_id
				AND invoice_context.invoice_id = if(
					JSONExtractString(r.metadata, 'stripe_invoice_id') != '',
					JSONExtractString(r.metadata, 'stripe_invoice_id'),
					if(startsWith(r.transaction_id, 'in_'), r.transaction_id, '')
				)
			LEFT JOIN stripe_payment_context payment_context
				ON payment_context.owner_id = r.owner_id
				AND payment_context.payment_intent_id = if(
					JSONExtractString(r.metadata, 'stripe_payment_intent_id') != '',
					JSONExtractString(r.metadata, 'stripe_payment_intent_id'),
					if(startsWith(r.transaction_id, 'pi_'), r.transaction_id, '')
				)
		),
		stripe_invoice_payment_totals AS (
			SELECT
				owner_id,
				JSONExtractString(metadata, 'stripe_invoice_id') AS invoice_id,
				currency,
				sum(amount) AS amount
			FROM revenue_latest_range
			WHERE provider = 'stripe'
				AND status = 'completed'
				AND JSONExtractString(metadata, 'stripe_money_kind') = 'invoice_payment'
				AND JSONExtractString(metadata, 'stripe_invoice_id') != ''
			GROUP BY owner_id, invoice_id, currency
		),
		revenue_base AS (
			SELECT
				r.transaction_id,
				if(
					JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback',
					r.amount - ifNull(invoice_payments.amount, 0),
					r.amount
				) AS amount,
				if(
					JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback',
					'subscription',
					r.type
				) AS type,
				coalesce(r.anonymous_id, nullIf(r.linked_anonymous_id, '')) as r_anonymous_id,
				coalesce(r.session_id, nullIf(r.linked_session_id, '')) as r_session_id,
				coalesce(nullIf(r.customer_id, ''), nullIf(r.linked_customer_id, '')) as r_customer_id,
				r.product_id,
					coalesce(r.product_name, nullIf(r.linked_product_name, '')) as product_name,
				r.provider,
				r.currency,
				r.metadata,
				r.created
				FROM revenue_with_invoice_context r
				LEFT JOIN stripe_invoice_payment_totals invoice_payments
					ON invoice_payments.owner_id = r.reconciliation_owner_id
					AND invoice_payments.invoice_id = JSONExtractString(r.metadata, 'stripe_invoice_id')
					AND invoice_payments.currency = r.currency
				WHERE
					${attributedWebsiteScope}
					AND r.created >= toDateTime({startDate:String})
				AND r.created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND (
					r.type != 'subscription_event'
					OR JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback'
				)
				AND (
					(r.type = 'refund' AND r.status = 'refunded')
					OR (r.type != 'refund' AND r.status = 'completed')
				)
				AND NOT (
					r.provider = 'stripe'
					AND startsWith(r.transaction_id, 'pi_')
					AND r.transaction_id IN (
						SELECT payment_intent_id FROM linked_payment_intents
					)
				)
				AND NOT (
					r.provider = 'stripe'
					AND startsWith(r.transaction_id, 'in_')
					AND JSONExtractString(r.metadata, 'databuddy_revenue_model') = ''
					AND (
						(r.amount, toUnixTimestamp(r.created), r.customer_id) IN (SELECT amount, ts, customer_id FROM legacy_pi_dedup)
						OR (r.amount, toUnixTimestamp(r.created) + 1, r.customer_id) IN (SELECT amount, ts, customer_id FROM legacy_pi_dedup)
						OR (r.amount, toUnixTimestamp(r.created) - 1, r.customer_id) IN (SELECT amount, ts, customer_id FROM legacy_pi_dedup)
					)
				)
				AND NOT (
					r.provider = 'stripe'
					AND JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback'
					AND r.amount <= ifNull(invoice_payments.amount, 0)
				)
		),
		customer_session_map AS (
			SELECT
				provider,
				customer_id,
				argMin(session_id, created) as mapped_session_id,
				min(created) as mapped_session_created
			FROM ${Analytics.revenue}
			WHERE ${directScope}
				AND created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND customer_id != ''
				AND session_id IS NOT NULL AND session_id != ''
			GROUP BY provider, customer_id
		),
		attributed_sessions AS (
			SELECT DISTINCT session_id
			FROM ${Analytics.revenue}
			WHERE ${directScope}
				AND created >= toDateTime({startDate:String}) - INTERVAL 90 DAY
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND session_id IS NOT NULL AND session_id != ''
			UNION DISTINCT
			SELECT mapped_session_id AS session_id FROM customer_session_map
			WHERE mapped_session_id IS NOT NULL AND mapped_session_id != ''
		),
		first_touch_by_session AS (
			SELECT
				session_id,
				min(time) as first_touch_time,
				argMin(ifNull(country, ''), time) as first_country,
				argMin(ifNull(region, ''), time) as first_region,
				argMin(ifNull(city, ''), time) as first_city,
				argMin(ifNull(browser_name, ''), time) as first_browser,
				argMin(ifNull(device_type, ''), time) as first_device,
				argMin(ifNull(os_name, ''), time) as first_os,
				argMin(domain(ifNull(referrer, '')), time) as first_referrer,
				argMin(ifNull(utm_source, ''), time) as first_utm_source,
				argMin(ifNull(utm_medium, ''), time) as first_utm_medium,
				argMin(ifNull(utm_campaign, ''), time) as first_utm_campaign,
				argMin(path, time) as first_path
			FROM ${Analytics.events}
			WHERE ${eventScope}
				AND session_id IN (SELECT session_id FROM attributed_sessions)
				AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			GROUP BY session_id
		),
		revenue_attributed AS (
			SELECT
				rb.transaction_id,
				rb.amount,
				rb.type,
				rb.r_anonymous_id,
				rb.r_session_id,
				rb.r_customer_id,
				rb.product_id,
				rb.product_name,
				rb.provider as revenue_provider,
				rb.currency,
				rb.metadata,
				rb.created,
				CASE
					WHEN ft_direct.session_id != '' THEN 1
					WHEN ft_customer.session_id != '' THEN 1
					ELSE 0
				END as is_attributed,
				coalesce(ft_direct.first_country, ft_customer.first_country) as country,
				coalesce(ft_direct.first_region, ft_customer.first_region) as region,
				coalesce(ft_direct.first_city, ft_customer.first_city) as city,
				coalesce(ft_direct.first_browser, ft_customer.first_browser) as browser_name,
				coalesce(ft_direct.first_device, ft_customer.first_device) as device_type,
				coalesce(ft_direct.first_os, ft_customer.first_os) as os_name,
				coalesce(ft_direct.first_referrer, ft_customer.first_referrer) as referrer_domain,
				coalesce(ft_direct.first_utm_source, ft_customer.first_utm_source) as utm_source,
				coalesce(ft_direct.first_utm_medium, ft_customer.first_utm_medium) as utm_medium,
				coalesce(ft_direct.first_utm_campaign, ft_customer.first_utm_campaign) as utm_campaign,
				coalesce(ft_direct.first_path, ft_customer.first_path) as entry_path
			FROM revenue_base rb
			LEFT JOIN first_touch_by_session ft_direct
				ON rb.r_session_id = ft_direct.session_id
				AND rb.r_session_id IS NOT NULL
				AND rb.r_session_id != ''
				AND ft_direct.first_touch_time <= rb.created
			LEFT JOIN customer_session_map csm
				ON rb.provider = csm.provider
				AND rb.r_customer_id = csm.customer_id
				AND rb.r_customer_id IS NOT NULL
				AND rb.r_customer_id != ''
				AND csm.mapped_session_created <= rb.created
				AND ft_direct.session_id = ''
			LEFT JOIN first_touch_by_session ft_customer
				ON csm.mapped_session_id = ft_customer.session_id
				AND csm.mapped_session_id IS NOT NULL
				AND csm.mapped_session_id != ''
				AND ft_customer.first_touch_time <= rb.created
		)
	`;
}

function buildScopeParams(
	projectId: string,
	filterParams?: Record<string, Filter["value"]>
): Record<string, Filter["value"]> {
	return isOrgScope(filterParams) ? { organizationId: projectId } : {};
}

interface RevenueQueryConfig {
	extraConditions?: string[];
	from?: (
		defaultSource: string,
		context: { currencyWhereClause: string }
	) => string;
	groupBy?: string;
	innerCte?: { name: string; body: (filteredSource: string) => string };
	limit?: number;
	orderBy?: string;
	select: string;
}

function buildRevenueQuery(
	config: RevenueQueryConfig,
	websiteId: string,
	startDate: string,
	endDate: string,
	filters?: Filter[],
	customSqlParams?: Record<string, Filter["value"]>
): { sql: string; params: Record<string, Filter["value"]> } {
	const { whereClause, params: whereParams } = buildRevenueWhereClause(
		filters,
		config.extraConditions ?? []
	);

	const filteredSource = `revenue_attributed${whereClause}`;
	const baseCte = buildAttributionCte(customSqlParams);
	const withClause = config.innerCte
		? `WITH ${baseCte},\n\t\t${config.innerCte.name} AS (${config.innerCte.body(filteredSource)})`
		: `WITH ${baseCte}`;
	const defaultSource = config.innerCte ? config.innerCte.name : filteredSource;
	const fromExpr =
		config.from?.(defaultSource, {
			currencyWhereClause: buildCurrencyWhereClause(filters),
		}) ?? defaultSource;

	const parts = [withClause, config.select, `FROM ${fromExpr}`];
	if (config.groupBy) {
		parts.push(`GROUP BY ${config.groupBy}`);
	}
	if (config.orderBy) {
		parts.push(`ORDER BY ${config.orderBy}`);
	}
	if (config.limit !== undefined) {
		parts.push("LIMIT {limit:UInt32}");
	}

	return {
		sql: parts.join("\n"),
		params: {
			websiteId,
			startDate,
			endDate,
			...(config.limit === undefined ? {} : { limit: config.limit }),
			...buildScopeParams(websiteId, customSqlParams),
			...whereParams,
		},
	};
}

function makeRevenueBuilder(
	configFn: (limit: number | undefined) => RevenueQueryConfig,
	defaultLimit?: number
): CustomSqlFn {
	return ({ websiteId, startDate, endDate, filters, limit, filterParams }) =>
		buildRevenueQuery(
			configFn(
				defaultLimit === undefined ? undefined : (limit ?? defaultLimit)
			),
			websiteId,
			startDate,
			endDate,
			filters,
			filterParams
		);
}

const REVENUE_METRICS = `
		currency,
		sumIf(amount, type != 'refund') as revenue,
		countIf(type != 'refund') as transactions,
		uniq(r_customer_id) as customers,
		ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER (PARTITION BY currency), 0)) * 100, 2) as percentage`;

function dimensionCase(column: string, fallback: string): string {
	return `CASE
		WHEN is_attributed = 0 THEN 'Unattributed'
		WHEN ${column} = '' OR ${column} IS NULL THEN '${fallback}'
		ELSE ${column}
	END`;
}

function recentTransactionDimension(
	column: string,
	fallback: string,
	alias: string
): string {
	return `CASE WHEN is_attributed = 0 THEN 'Unattributed' ELSE coalesce(nullIf(${column}, ''), '${fallback}') END as ${alias}`;
}

const REVENUE_BREAKDOWN_FIELDS = [
	{ name: "name", type: "string" as const, label: "Name" },
	{ name: "currency", type: "string" as const, label: "Currency" },
	{ name: "revenue", type: "number" as const, label: "Revenue" },
	{ name: "transactions", type: "number" as const, label: "Transactions" },
	{ name: "customers", type: "number" as const, label: "Customers" },
	{ name: "percentage", type: "number" as const, label: "Share", unit: "%" },
];

const REVENUE_GEO_BREAKDOWN_FIELDS = [
	{ name: "name", type: "string" as const, label: "Name" },
	{ name: "country", type: "string" as const, label: "Country" },
	{ name: "currency", type: "string" as const, label: "Currency" },
	{ name: "revenue", type: "number" as const, label: "Revenue" },
	{ name: "transactions", type: "number" as const, label: "Transactions" },
	{ name: "customers", type: "number" as const, label: "Customers" },
	{ name: "percentage", type: "number" as const, label: "Share", unit: "%" },
];

const revenueBuilderDefinitions: Record<string, SimpleQueryConfig> = {
	revenue_overview: {
		meta: {
			title: "Revenue Overview",
			description:
				"Aggregate revenue, refund, subscription, and attribution totals.",
			category: "Revenue",
			tags: ["revenue", "overview", "summary"],
			output_fields: [
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "total_revenue", type: "number", label: "Total Revenue" },
				{
					name: "total_transactions",
					type: "number",
					label: "Total Transactions",
				},
				{ name: "refund_amount", type: "number", label: "Refund Amount" },
				{ name: "refund_count", type: "number", label: "Refund Count" },
				{
					name: "subscription_revenue",
					type: "number",
					label: "Subscription Revenue",
				},
				{
					name: "subscription_count",
					type: "number",
					label: "Subscription Count",
				},
				{ name: "sale_revenue", type: "number", label: "Sale Revenue" },
				{ name: "sale_count", type: "number", label: "Sale Count" },
				{ name: "unique_customers", type: "number", label: "Unique Customers" },
				{
					name: "attributed_transactions",
					type: "number",
					label: "Attributed Transactions",
				},
				{
					name: "attributed_revenue",
					type: "number",
					label: "Attributed Revenue",
				},
				{
					name: "failed_payment_attempts",
					type: "number",
					label: "Failed Payment Attempts",
				},
				{
					name: "canceled_payment_attempts",
					type: "number",
					label: "Canceled Payment Attempts",
				},
				{
					name: "failed_payment_amount",
					type: "number",
					label: "Failed Payment Amount",
				},
				{
					name: "recovered_payment_attempts",
					type: "number",
					label: "Recovered Payment Attempts",
				},
				{
					name: "successful_payment_attempts",
					type: "number",
					label: "Successful Payment Attempts",
				},
				{
					name: "observed_failure_event_types",
					type: "number",
					label: "Observed Failure Event Types",
				},
				{
					name: "required_failure_event_types",
					type: "number",
					label: "Required Failure Event Types",
				},
				{
					name: "top_payment_failure_reason",
					type: "string",
					label: "Top Payment Failure Reason",
				},
				{
					name: "top_payment_cancellation_reason",
					type: "string",
					label: "Top Payment Cancellation Reason",
				},
				{
					name: "payment_failure_rate",
					type: "number",
					label: "Payment Failure Rate",
					unit: "%",
				},
			],
			default_visualization: "metric",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(() => ({
			innerCte: {
				name: "revenue_summary",
				body: (source) => `
					SELECT
						currency,
						sumIf(amount, type != 'refund') as total_revenue,
						countIf(type != 'refund') as total_transactions,
						sumIf(amount, type = 'refund') as refund_amount,
						countIf(type = 'refund') as refund_count,
						sumIf(amount, type = 'subscription') as subscription_revenue,
						countIf(type = 'subscription') as subscription_count,
						sumIf(amount, type = 'sale') as sale_revenue,
						countIf(type = 'sale') as sale_count,
						uniq(r_customer_id) as unique_customers,
						countIf(is_attributed = 1 AND type != 'refund') as attributed_transactions,
						sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue,
						uniqExactIf(
							transaction_id,
							revenue_provider = 'stripe'
							AND type != 'refund'
							AND JSONExtractString(metadata, 'databuddy_revenue_model') = 'stripe_events_v1'
						) as successful_payment_attempts,
						arrayDistinct(arrayFlatten(groupArrayIf(
							arrayFilter(key -> key != '', [
								if(
									JSONExtractString(metadata, 'stripe_payment_intent_id') != '',
									concat('pi:', JSONExtractString(metadata, 'stripe_payment_intent_id')),
									if(startsWith(transaction_id, 'pi_'), concat('pi:', transaction_id), '')
								),
								if(
									JSONExtractString(metadata, 'stripe_invoice_id') != '',
									concat('in:', JSONExtractString(metadata, 'stripe_invoice_id')),
									if(startsWith(transaction_id, 'in_'), concat('in:', transaction_id), '')
								),
								if(
									JSONExtractString(metadata, 'stripe_payment_intent_id') = ''
									AND JSONExtractString(metadata, 'stripe_invoice_id') = ''
									AND NOT startsWith(transaction_id, 'pi_')
									AND NOT startsWith(transaction_id, 'in_'),
									concat('event:', transaction_id),
									''
								)
							]),
							revenue_provider = 'stripe'
							AND type != 'refund'
							AND JSONExtractString(metadata, 'databuddy_revenue_model') = 'stripe_events_v1'
						))) as successful_payment_keys
					FROM ${source}
					GROUP BY currency
				`,
			},
			from: (source, { currencyWhereClause }) => `(
				SELECT
					if(summary.currency = '', attempts.currency, summary.currency) AS currency,
					summary.total_revenue,
					summary.total_transactions,
					summary.refund_amount,
					summary.refund_count,
					summary.subscription_revenue,
					summary.subscription_count,
					summary.sale_revenue,
					summary.sale_count,
					summary.unique_customers,
					summary.attributed_transactions,
					summary.attributed_revenue,
					summary.successful_payment_attempts,
					summary.successful_payment_keys,
					attempts.attempt_key,
					attempts.event_type AS attempt_event_type,
					attempts.failure_reason AS attempt_failure_reason,
					attempts.cancellation_reason AS attempt_cancellation_reason,
					attempts.status AS attempt_status,
					attempts.amount AS attempt_amount,
					failure_observations.observed_failure_event_types,
					has(summary.successful_payment_keys, attempts.attempt_key) AS attempt_recovered
				FROM ${source} summary
				FULL OUTER JOIN (
					SELECT * FROM stripe_payment_attempts${currencyWhereClause}
				) attempts USING (currency)
				LEFT JOIN stripe_failure_observations failure_observations
					ON failure_observations.currency = if(summary.currency = '', attempts.currency, summary.currency)
			)`,
			select: `SELECT
				currency,
				any(total_revenue) as total_revenue,
				any(total_transactions) as total_transactions,
				any(refund_amount) as refund_amount,
				any(refund_count) as refund_count,
				any(subscription_revenue) as subscription_revenue,
				any(subscription_count) as subscription_count,
				any(sale_revenue) as sale_revenue,
				any(sale_count) as sale_count,
				any(unique_customers) as unique_customers,
				any(attributed_transactions) as attributed_transactions,
				any(attributed_revenue) as attributed_revenue,
				countIf(attempt_status = 'failed') as failed_payment_attempts,
				countIf(attempt_status = 'canceled') as canceled_payment_attempts,
				sumIf(attempt_amount, attempt_status = 'failed') as failed_payment_amount,
				uniqExactIf(
					attempt_key,
					attempt_status = 'failed' AND attempt_recovered
				) as recovered_payment_attempts,
				any(successful_payment_attempts) as successful_payment_attempts,
				any(observed_failure_event_types) as observed_failure_event_types,
				toUInt8(${STRIPE_FAILURE_WEBHOOK_EVENTS.length}) as required_failure_event_types,
				arrayElement(
					topKIf(1)(
						attempt_failure_reason,
						attempt_status = 'failed' AND attempt_failure_reason != ''
					),
					1
				) as top_payment_failure_reason,
				arrayElement(
					topKIf(1)(
						attempt_cancellation_reason,
						attempt_status = 'canceled' AND attempt_cancellation_reason != ''
					),
					1
				) as top_payment_cancellation_reason,
				round(
					100 * failed_payment_attempts /
					nullIf(failed_payment_attempts + successful_payment_attempts, 0),
					2
				) as payment_failure_rate`,
			groupBy: "currency",
		})),
		timeField: "created",
		customizable: false,
	},

	revenue_time_series: {
		meta: {
			title: "Revenue Time Series",
			description:
				"Daily revenue, transactions, customers, refunds, and attribution.",
			category: "Revenue",
			tags: ["revenue", "time-series", "trends"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "revenue", type: "number", label: "Revenue" },
				{ name: "transactions", type: "number", label: "Transactions" },
				{ name: "customers", type: "number", label: "Customers" },
				{ name: "refund_amount", type: "number", label: "Refund Amount" },
				{ name: "refund_count", type: "number", label: "Refund Count" },
				{
					name: "attributed_revenue",
					type: "number",
					label: "Attributed Revenue",
				},
				{
					name: "attributed_transactions",
					type: "number",
					label: "Attributed Transactions",
				},
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		customSql: makeRevenueBuilder(() => ({
			select: `SELECT
				toDate(created) as date,
				currency,
				sumIf(amount, type != 'refund') as revenue,
				countIf(type != 'refund') as transactions,
				uniq(r_customer_id) as customers,
				sumIf(amount, type = 'refund') as refund_amount,
				countIf(type = 'refund') as refund_count,
				sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue,
				countIf(is_attributed = 1 AND type != 'refund') as attributed_transactions`,
			groupBy: "date, currency",
			orderBy: "date ASC",
		})),
		timeField: "created",
		customizable: false,
	},

	revenue_by_provider: {
		meta: {
			title: "Revenue by Provider",
			description: "Revenue breakdown by payment provider.",
			category: "Revenue",
			tags: ["revenue", "provider"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(() => ({
			select: `SELECT
				revenue_provider as name,${REVENUE_METRICS}`,
			groupBy: "revenue_provider, currency",
			orderBy: "revenue DESC",
		})),
		timeField: "created",
		customizable: false,
	},

	revenue_by_product: {
		meta: {
			title: "Revenue by Product",
			description: "Revenue breakdown by product.",
			category: "Revenue",
			tags: ["revenue", "product"],
			output_fields: [
				{ name: "name", type: "string", label: "Product" },
				{ name: "product_id", type: "string", label: "Product ID" },
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "revenue", type: "number", label: "Revenue" },
				{ name: "transactions", type: "number", label: "Transactions" },
				{ name: "customers", type: "number", label: "Customers" },
				{ name: "percentage", type: "number", label: "Share", unit: "%" },
			],
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				coalesce(product_name, 'Unknown') as name,
				product_id,${REVENUE_METRICS}`,
				groupBy: "product_name, product_id, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			50
		),
		timeField: "created",
		customizable: true,
	},

	revenue_attribution_overview: {
		meta: {
			title: "Revenue Attribution Overview",
			description: "Attributed vs unattributed revenue split.",
			category: "Revenue",
			tags: ["revenue", "attribution"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(() => ({
			select: `SELECT
				CASE WHEN is_attributed = 1 THEN 'Attributed' ELSE 'Unattributed' END as name,${REVENUE_METRICS}`,
			groupBy: "is_attributed, currency",
			orderBy: "revenue DESC",
		})),
		timeField: "created",
		customizable: false,
	},

	revenue_by_country: {
		meta: {
			title: "Revenue by Country",
			description: "Attributed revenue breakdown by country.",
			category: "Revenue",
			tags: ["revenue", "country", "geo"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("country", "Unknown")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
		plugins: { deduplicateGeo: true, normalizeGeo: true },
	},

	revenue_by_region: {
		meta: {
			title: "Revenue by Region",
			description: "Attributed revenue breakdown by region/state.",
			category: "Revenue",
			tags: ["revenue", "region", "geo"],
			output_fields: REVENUE_GEO_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("region", "Unknown")} as name,
				country,${REVENUE_METRICS}`,
				groupBy: "name, country, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
		plugins: { normalizeGeo: true },
	},

	revenue_by_city: {
		meta: {
			title: "Revenue by City",
			description: "Attributed revenue breakdown by city.",
			category: "Revenue",
			tags: ["revenue", "city", "geo"],
			output_fields: REVENUE_GEO_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("city", "Unknown")} as name,
				country,${REVENUE_METRICS}`,
				groupBy: "name, country, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
		plugins: { normalizeGeo: true },
	},

	revenue_by_browser: {
		meta: {
			title: "Revenue by Browser",
			description: "Attributed revenue breakdown by browser.",
			category: "Revenue",
			tags: ["revenue", "browser"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("browser_name", "Unknown")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			10
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_device: {
		meta: {
			title: "Revenue by Device",
			description: "Attributed revenue breakdown by device type.",
			category: "Revenue",
			tags: ["revenue", "device"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("device_type", "Unknown")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			10
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_os: {
		meta: {
			title: "Revenue by OS",
			description: "Attributed revenue breakdown by operating system.",
			category: "Revenue",
			tags: ["revenue", "os"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("os_name", "Unknown")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			10
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_referrer: {
		meta: {
			title: "Revenue by Referrer",
			description: "Attributed revenue breakdown by referrer domain.",
			category: "Revenue",
			tags: ["revenue", "referrer"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				referrer_name as name,${REVENUE_METRICS}`,
				groupBy: "referrer_name, currency",
				orderBy: "revenue DESC",
				limit,
				innerCte: {
					name: "referrer_agg",
					body: (source) => `
						SELECT
							${dimensionCase("referrer_domain", "Direct")} as referrer_name,
							currency,
							amount,
							type,
							r_customer_id
						FROM ${source}
					`,
				},
			}),
			20
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_source: {
		meta: {
			title: "Revenue by UTM Source",
			description: "Attributed revenue breakdown by UTM source.",
			category: "Revenue",
			tags: ["revenue", "utm", "source"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("utm_source", "None")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_medium: {
		meta: {
			title: "Revenue by UTM Medium",
			description: "Attributed revenue breakdown by UTM medium.",
			category: "Revenue",
			tags: ["revenue", "utm", "medium"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("utm_medium", "None")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_utm_campaign: {
		meta: {
			title: "Revenue by UTM Campaign",
			description: "Attributed revenue breakdown by UTM campaign.",
			category: "Revenue",
			tags: ["revenue", "utm", "campaign"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("utm_campaign", "None")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
	},

	revenue_by_entry_page: {
		meta: {
			title: "Revenue by Entry Page",
			description: "Attributed revenue breakdown by entry page path.",
			category: "Revenue",
			tags: ["revenue", "entry", "page"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				${dimensionCase("entry_path", "Unknown")} as name,${REVENUE_METRICS}`,
				groupBy: "name, currency",
				orderBy: "revenue DESC",
				limit,
			}),
			20
		),
		timeField: "created",
		customizable: true,
	},

	recent_transactions: {
		meta: {
			title: "Recent Transactions",
			description:
				"Most recent non-refund transactions with attribution context.",
			category: "Revenue",
			tags: ["revenue", "transactions", "recent"],
			output_fields: [
				{ name: "transaction_id", type: "string", label: "Transaction ID" },
				{ name: "provider", type: "string", label: "Provider" },
				{ name: "type", type: "string", label: "Type" },
				{ name: "amount", type: "number", label: "Amount" },
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "anonymous_id", type: "string", label: "Anonymous ID" },
				{ name: "product_name", type: "string", label: "Product" },
				{ name: "created", type: "datetime", label: "Created" },
				{ name: "is_attributed", type: "number", label: "Attributed" },
				{ name: "country", type: "string", label: "Country" },
				{ name: "browser_name", type: "string", label: "Browser" },
				{ name: "device_type", type: "string", label: "Device" },
				{ name: "referrer", type: "string", label: "Referrer" },
				{ name: "utm_source", type: "string", label: "UTM Source" },
				{ name: "utm_campaign", type: "string", label: "UTM Campaign" },
			],
			default_visualization: "table",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				transaction_id,
				revenue_provider as provider,
				type,
				amount,
				currency,
				r_anonymous_id as anonymous_id,
				product_name,
				created,
				is_attributed,
				${recentTransactionDimension("country", "Unknown", "country")},
				${recentTransactionDimension("browser_name", "Unknown", "browser_name")},
				${recentTransactionDimension("device_type", "Unknown", "device_type")},
				${recentTransactionDimension("referrer_domain", "Direct", "referrer")},
				${recentTransactionDimension("utm_source", "None", "utm_source")},
				${recentTransactionDimension("utm_campaign", "None", "utm_campaign")}`,
				orderBy: "created DESC",
				limit,
				extraConditions: ["type != 'refund'"],
			}),
			50
		),
		timeField: "created",
		customizable: true,
		plugins: { normalizeGeo: true },
	},
};

export const RevenueBuilders: Record<string, SimpleQueryConfig> =
	Object.fromEntries(
		Object.entries(revenueBuilderDefinitions).map(([name, config]) => [
			name,
			{ ...config, allowedFilters: REVENUE_ALLOWED_FILTERS },
		])
	);
