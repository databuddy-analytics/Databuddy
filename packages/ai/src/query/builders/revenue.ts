import {
	buildRevenueLatestCte,
	canonicalStripePaymentCondition,
	explicitRevenueWebsiteExpression,
	linkedStripePaymentsCte,
	paymentIntentIdExpression,
	stripeContextAggregates,
} from "@databuddy/db/clickhouse";
import { STRIPE_FAILURE_WEBHOOK_EVENTS } from "@databuddy/shared/stripe-webhooks";
import { Analytics } from "../../types/tables";
import { AI_VISIT_PARAMS, aiVisitProduct } from "./ai-agents";
import { escapeLikePattern } from "../simple-builder";
import type { CustomSqlContext, Filter, SimpleQueryConfig } from "../types";

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
	product_id: "ifNull(product_id, '')",
	product_name: "product_name",
	type: "type",
	currency: "currency",
};

const REVENUE_ALLOWED_FILTERS = ["currency", "provider", "type"];
const REVENUE_OVERVIEW_ALLOWED_FILTERS = [
	"currency",
	"provider",
	"product_id",
	"product_name",
];

function fixedValueMatchesFilter(value: string, filter: Filter): boolean {
	const values = (
		Array.isArray(filter.value) ? filter.value : [filter.value]
	).map((item) => String(item));
	if ((filter.op === "in" || filter.op === "not_in") && values.length === 0) {
		return true;
	}
	const expected = String(filter.value);

	switch (filter.op) {
		case "eq":
			return value === expected;
		case "ne":
			return value !== expected;
		case "in":
			return values.includes(value);
		case "not_in":
			return !values.includes(value);
		case "contains":
			return value.includes(expected);
		case "not_contains":
			return !value.includes(expected);
		case "starts_with":
			return value.startsWith(expected);
		default:
			return false;
	}
}

function stripePaymentMetricsInScope(filters?: Filter[]): boolean {
	return (filters ?? []).every((filter) => {
		if (!filter || filter.having) {
			return true;
		}
		if (filter.field === "currency") {
			return true;
		}
		if (filter.field === "provider") {
			return fixedValueMatchesFilter("stripe", filter);
		}
		return false;
	});
}

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

function buildStripePaymentWhereClause(
	filters: Filter[] | undefined,
	paymentMetricsInScope: boolean
): string {
	const currencyWhereClause = buildCurrencyWhereClause(filters);
	if (paymentMetricsInScope) {
		return currencyWhereClause;
	}
	return currencyWhereClause ? `${currencyWhereClause} AND 0` : " WHERE 0";
}

function isOrgScope(filterParams?: Record<string, Filter["value"]>): boolean {
	return filterParams?.__orgLevel === "true";
}

const FIRST_TOUCH_DIMENSIONS = {
	country: "country",
	region: "region",
	city: "city",
	browser_name: "browser_name",
	device_type: "device_type",
	os_name: "os_name",
	referrer_domain: "domain(referrer)",
	utm_source: "utm_source",
	utm_medium: "utm_medium",
	utm_campaign: "utm_campaign",
	entry_path: "path",
};

function firstTouchCte(
	name: string,
	key: "session_id" | "profile_id" | "anonymous_id"
): string {
	return `${name} AS (
		SELECT client_id, ${key}, min(time) as first_touch_time,
			minMapIf(map(profile_id, time), profile_id != '') AS profile_first_touches,
			argMin(tuple(${Object.values(FIRST_TOUCH_DIMENSIONS)
				.map((column) => `ifNull(${column}, '')`)
				.join(", ")}), tuple(time, id)) AS first_touch
		FROM attribution_events WHERE ${key} != ''
		GROUP BY client_id, ${key}
	)`;
}

function trackedProfileCondition(
	alias: string,
	created: string,
	profile: string
): string {
	const touches = `${alias}.profile_first_touches`;
	const profileId = `ifNull(${profile}, '')`;
	return `arrayCount(at -> at <= ${created}, mapValues(${touches})) < 2
		AND (${profileId} = '' OR arrayAll((id, at) -> at > ${created} OR id = ${profileId}, mapKeys(${touches}), mapValues(${touches})))`;
}

function fromContexts(column: string, alias: string, base: string): string {
	return `coalesce(${base}, nullIf(invoice_context.linked_${column}, ''), nullIf(payment_context.${column}, '')) as ${alias}`;
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
	const paymentIntentId = paymentIntentIdExpression();
	const relatedStripeScope = `(
		${directScope}
		OR (
			provider = 'stripe'
			AND owner_id IN (SELECT owner_id FROM scoped_stripe_owners)
		)
	)`;
	const attributedWebsiteScope = orgScope
		? "(r_website_id IN {websiteIds:Array(String)} OR (r.owner_id = {organizationId:String} AND r_website_id = ''))"
		: "r_website_id = {websiteId:String}";
	const legacyWebsite = orgScope
		? "if(owner_id IN {websiteIds:Array(String)}, owner_id, '')"
		: "if(owner_id = {websiteId:String}, owner_id, '')";

	return `
			scoped_stripe_owners AS (
				SELECT DISTINCT owner_id
				FROM ${Analytics.revenue}
				WHERE ${directScope}
					AND created <= toDateTime(concat({endDate:String}, ' 23:59:59')) + INTERVAL 1 DAY
					AND provider = 'stripe'
					AND owner_id != ''
				),
			${buildRevenueLatestCte({
				candidateWhere: `created >= toDateTime({startDate:String})
						AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))`,
				name: "revenue_latest_range",
				scope: relatedStripeScope,
			})},
		${linkedStripePaymentsCte(relatedStripeScope)},
		stripe_payment_context AS (
			SELECT
				owner_id,
				${paymentIntentId} AS payment_intent_id,
				${stripeContextAggregates()}
			FROM ${Analytics.revenue} FINAL
			WHERE provider = 'stripe'
				AND type != 'refund'
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND owner_id IN (SELECT owner_id FROM scoped_stripe_owners)
				AND ${paymentIntentId} != ''
			GROUP BY owner_id, payment_intent_id
		),
		stripe_invoice_context AS (
			SELECT
				owner_id,
				JSONExtractString(metadata, 'stripe_invoice_id') AS invoice_id,
				${stripeContextAggregates("linked_")}
			FROM ${Analytics.revenue} FINAL
			WHERE provider = 'stripe'
				AND owner_id IN (SELECT owner_id FROM scoped_stripe_owners)
				-- Invoice link delivery can cross UTC midnight.
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59')) + INTERVAL 1 DAY
				AND JSONExtractString(metadata, 'stripe_record_kind') IN ('link', 'money')
				AND type != 'refund'
				AND JSONExtractString(metadata, 'stripe_invoice_id') != ''
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
			FROM revenue_latest_range
			WHERE ${directScope}
				AND provider = 'stripe'
				AND type = 'subscription_event'
				AND JSONExtractString(metadata, 'stripe_record_kind') = 'attempt'
		),
		stripe_payment_attempts AS (
			SELECT
				attempt.attempt_id,
				attempt.attempt_key,
				attempt.event_type,
				attempt.family_failure_reason AS failure_reason,
				attempt.cancellation_reason,
				attempt.status,
				attempt.currency,
				attempt.amount,
				attempt.observed_failure_event_types
			FROM (
				SELECT
					*,
					argMax(
						failure_reason,
						tuple(failure_reason_rank, attempt_id)
					) OVER (PARTITION BY attempt_key) AS family_failure_reason,
					max(event_type = 'invoice.payment_failed')
						OVER (PARTITION BY attempt_key) AS invoice_failure_for_key,
					max(event_type = 'invoice.payment_failed')
						OVER (PARTITION BY invoice_id) AS invoice_failure_for_invoice,
					uniqExactIf(
						event_type,
						status = 'failed'
						AND event_type IN (
							${STRIPE_FAILURE_EVENT_SQL}
						)
					) OVER (PARTITION BY currency) AS observed_failure_event_types
					FROM stripe_payment_attempt_rows
			) attempt
			WHERE NOT (
				attempt.event_type = 'payment_intent.payment_failed'
				AND (
					attempt.invoice_failure_for_key = 1
					OR (
						attempt.invoice_id != ''
						AND attempt.invoice_failure_for_invoice = 1
					)
				)
			)
		),
		revenue_base AS (
			SELECT
				r.transaction_id,
				r.owner_id as revenue_owner_id,
				if(r.type = 'refund' AND JSONExtractString(r.metadata, 'stripe_invoice_id') = ''
					AND payment_context.payment_invoice_count > 1 AND ${explicitRevenueWebsiteExpression("r")} IS NULL,
					'', coalesce(${explicitRevenueWebsiteExpression("r")}, nullIf(invoice_context.linked_explicit_website_id, ''), nullIf(payment_context.explicit_website_id, ''), r.website_id, nullIf(payment_context.website_id, ''), nullIf(invoice_context.linked_website_id, ''), ${legacyWebsite.replaceAll("owner_id", "r.owner_id")})) as r_website_id,
				r.amount AS amount,
				r.type AS type,
				${fromContexts("profile_id", "r_profile_id", "nullIf(r.profile_id, '')")},
				${fromContexts("anonymous_id", "r_anonymous_id", "r.anonymous_id")},
				${fromContexts("session_id", "r_session_id", "r.session_id")},
				${fromContexts("customer_id", "r_customer_id", "nullIf(r.customer_id, '')")},
				r.product_id,
				${fromContexts("product_name", "product_name", "r.product_name")},
				r.provider,
				r.currency,
				r.metadata,
				r.created
			FROM revenue_latest_range r
			LEFT JOIN stripe_payment_context payment_context
				ON r.provider = 'stripe' AND payment_context.owner_id = r.owner_id
				AND payment_context.payment_intent_id = ${paymentIntentIdExpression("r")}
			LEFT JOIN stripe_invoice_context invoice_context
				ON r.provider = 'stripe' AND invoice_context.owner_id = r.owner_id
				AND invoice_context.invoice_id = coalesce(nullIf(JSONExtractString(r.metadata, 'stripe_invoice_id'), ''), nullIf(payment_context.payment_invoice_id, ''))
			WHERE
				${attributedWebsiteScope}
				AND r.type != 'subscription_event'
				AND (
					(r.type = 'refund' AND r.status = 'refunded')
					OR (r.type != 'refund' AND r.status = 'completed')
				)
				AND ${canonicalStripePaymentCondition("r")}
		),
		customer_session_candidates AS (
			SELECT
				c.owner_id, c.provider, c.customer_id, c.session_id, c.profile_id, c.created,
				coalesce(${explicitRevenueWebsiteExpression("c")}, nullIf(payment_context.explicit_website_id, ''), nullIf(c.website_id, ''), nullIf(payment_context.website_id, ''), ${legacyWebsite.replaceAll("owner_id", "c.owner_id")}) as client_id
			FROM (SELECT * FROM ${Analytics.revenue} FINAL WHERE ${relatedStripeScope}) c
			LEFT JOIN stripe_payment_context payment_context
				ON c.provider = 'stripe' AND payment_context.owner_id = c.owner_id
				AND payment_context.payment_intent_id = ${paymentIntentIdExpression("c")}
			WHERE ${eventScope}
				AND c.created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND c.customer_id != ''
				AND c.session_id != ''
				AND (c.owner_id, c.provider, c.customer_id) IN (
					SELECT revenue_owner_id, provider, r_customer_id FROM revenue_base
				)
		),
		attribution_identifiers AS (
			SELECT session_id, profile_id, anonymous_id FROM ${Analytics.revenue} FINAL
			WHERE ${relatedStripeScope}
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59')) + INTERVAL 1 DAY
		),
		attribution_events AS (
			SELECT *
			FROM ${Analytics.events}
			WHERE ${eventScope}
				AND (session_id IN (SELECT session_id FROM attribution_identifiers WHERE ifNull(session_id, '') != '')
					OR profile_id IN (SELECT profile_id FROM attribution_identifiers WHERE profile_id != '')
					OR anonymous_id IN (SELECT anonymous_id FROM attribution_identifiers WHERE ifNull(anonymous_id, '') != ''))
				AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
		),
		${firstTouchCte("first_touch_by_session", "session_id")},
		${firstTouchCte("first_touch_by_profile", "profile_id")},
		${firstTouchCte("first_touch_by_anonymous", "anonymous_id")},
		customer_session_map AS (
			SELECT c.owner_id, c.client_id, c.provider, c.customer_id,
				argMin(c.session_id, tuple(c.created, c.session_id)) as mapped_session_id,
				min(c.created) as mapped_session_created
			FROM customer_session_candidates c
			INNER JOIN first_touch_by_session ft ON c.client_id = ft.client_id AND c.session_id = ft.session_id
			WHERE ft.first_touch_time <= c.created
				AND ${trackedProfileCondition("ft", "c.created", "c.profile_id")}
			GROUP BY c.owner_id, c.client_id, c.provider, c.customer_id
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
				(ifNull(ft_direct.session_id, '') != '' AND ${trackedProfileCondition("ft_direct", "rb.created", "rb.r_profile_id")}) AS direct_match,
				(ifNull(ft_profile.profile_id, '') != '') AS profile_match,
				(ifNull(ft_anonymous.anonymous_id, '') != '' AND ${trackedProfileCondition("ft_anonymous", "rb.created", "rb.r_profile_id")}) AS anonymous_match,
				(ifNull(ft_customer.session_id, '') != '' AND ${trackedProfileCondition("ft_customer", "rb.created", "rb.r_profile_id")}) AS customer_match,
				multiIf(direct_match, 'session', profile_match, 'profile', anonymous_match, 'anonymous', customer_match, 'customer', 'unmatched') AS attribution_method,
				if(attribution_method != 'unmatched', 1, 0) AS is_attributed,
				multiIf(is_attributed = 1, '', rb.r_website_id = '', 'missing_website',
					ifNull(rb.r_profile_id, '') = '' AND ifNull(rb.r_session_id, '') = '' AND ifNull(rb.r_anonymous_id, '') = '', 'missing_browser_identity',
					'no_verified_prior_match') AS unmatched_reason,
				CAST(multiIf(
					direct_match, ft_direct.first_touch,
					profile_match, ft_profile.first_touch,
					anonymous_match, ft_anonymous.first_touch,
					customer_match, ft_customer.first_touch,
					tuple(${Object.keys(FIRST_TOUCH_DIMENSIONS)
						.map(() => "''")
						.join(", ")})
				), 'Tuple(${Object.keys(FIRST_TOUCH_DIMENSIONS)
					.map((column) => `${column} String`)
					.join(", ")})') AS attribution,
				${Object.keys(FIRST_TOUCH_DIMENSIONS)
					.map((column) => `attribution.${column} AS ${column}`)
					.join(",\n\t\t\t\t")}
			FROM revenue_base rb
			LEFT JOIN first_touch_by_session ft_direct
				ON rb.r_website_id = ft_direct.client_id AND rb.r_session_id = ft_direct.session_id
				AND rb.r_session_id != ''
				AND ft_direct.first_touch_time <= rb.created
			LEFT JOIN first_touch_by_profile ft_profile
				ON rb.r_website_id = ft_profile.client_id AND rb.r_profile_id = ft_profile.profile_id
				AND ft_profile.first_touch_time <= rb.created
			LEFT JOIN first_touch_by_anonymous ft_anonymous
				ON rb.r_website_id = ft_anonymous.client_id AND rb.r_anonymous_id = ft_anonymous.anonymous_id
				AND ft_anonymous.first_touch_time <= rb.created
			LEFT JOIN customer_session_map csm
				ON rb.revenue_owner_id = csm.owner_id AND rb.r_website_id = csm.client_id AND rb.provider = csm.provider
				AND rb.r_customer_id = csm.customer_id
				AND rb.r_customer_id != ''
				AND csm.mapped_session_created <= rb.created
			LEFT JOIN first_touch_by_session ft_customer
				ON csm.client_id = ft_customer.client_id AND csm.mapped_session_id = ft_customer.session_id
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
		context: {
			paymentMetricsInScope: boolean;
			stripePaymentWhereClause: string;
		}
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
	const paymentMetricsInScope = stripePaymentMetricsInScope(filters);
	const scope = `toUInt8(${paymentMetricsInScope ? 1 : 0}) AS payment_metrics_in_scope`;
	const withClause = config.innerCte
		? `WITH ${scope}, ${baseCte},\n\t\t${config.innerCte.name} AS (${config.innerCte.body(filteredSource)})`
		: `WITH ${scope}, ${baseCte}`;
	const defaultSource = config.innerCte ? config.innerCte.name : filteredSource;
	const fromExpr =
		config.from?.(defaultSource, {
			paymentMetricsInScope,
			stripePaymentWhereClause: buildStripePaymentWhereClause(
				filters,
				paymentMetricsInScope
			),
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

	// ClickHouse 25.5 can corrupt shared JOIN expressions when query steps merge.
	parts.push("SETTINGS query_plan_merge_expressions = 0");

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
) {
	return (ctx: CustomSqlContext) =>
		buildRevenueQuery(
			configFn(
				defaultLimit === undefined ? undefined : (ctx.limit ?? defaultLimit)
			),
			ctx.websiteId,
			ctx.startDate,
			ctx.endDate,
			ctx.filters,
			ctx.filterParams
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
		ELSE coalesce(nullIf(${column}, ''), '${fallback}')
	END`;
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

export const RevenueBuilders = {
	revenue_overview: {
		allowedFilters: REVENUE_OVERVIEW_ALLOWED_FILTERS,
		meta: {
			title: "Revenue Overview",
			description:
				"Aggregate revenue, refund, subscription, and attribution totals.",
			category: "Revenue",
			tags: ["revenue", "overview", "summary"],
			output_fields: [
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "total_revenue", type: "number", label: "Gross Revenue" },
				{
					name: "total_transactions",
					type: "number",
					label: "Payments",
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
					label: "Subscription Transactions",
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
					name: "payment_diagnostics_available",
					type: "number",
					label: "Payment Diagnostics Available",
					description:
						"1 when Stripe payment diagnostics support the selected filters; otherwise 0.",
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
						))) as successful_payment_keys
					FROM ${source}
					GROUP BY currency
				`,
			},
			from: (source, { stripePaymentWhereClause }) => `
				${source} summary
				FULL OUTER JOIN (
					SELECT * FROM stripe_payment_attempts${stripePaymentWhereClause}
				) attempts USING (currency)`,
			select: `SELECT
				currency,
				any(summary.total_revenue) as total_revenue,
				any(summary.total_transactions) as total_transactions,
				any(summary.refund_amount) as refund_amount,
				any(summary.refund_count) as refund_count,
				any(summary.subscription_revenue) as subscription_revenue,
				any(summary.subscription_count) as subscription_count,
				any(summary.sale_revenue) as sale_revenue,
				any(summary.sale_count) as sale_count,
				any(summary.unique_customers) as unique_customers,
				any(summary.attributed_transactions) as attributed_transactions,
				any(summary.attributed_revenue) as attributed_revenue,
				any(payment_metrics_in_scope) as payment_diagnostics_available,
				if(
					any(payment_metrics_in_scope) = 1,
					countIf(attempts.status = 'failed'),
					NULL
				) as failed_payment_attempts,
				if(
					any(payment_metrics_in_scope) = 1,
					countIf(attempts.status = 'canceled'),
					NULL
				) as canceled_payment_attempts,
				if(
					any(payment_metrics_in_scope) = 1,
					sumIf(attempts.amount, attempts.status = 'failed'),
					NULL
				) as failed_payment_amount,
				if(
					any(payment_metrics_in_scope) = 1,
					uniqExactIf(
						attempts.attempt_key,
						attempts.status = 'failed' AND has(summary.successful_payment_keys, attempts.attempt_key)
					),
					NULL
				) as recovered_payment_attempts,
				if(
					any(payment_metrics_in_scope) = 1,
					any(summary.successful_payment_attempts),
					NULL
				) as successful_payment_attempts,
				if(
					any(payment_metrics_in_scope) = 1,
					ifNull(any(attempts.observed_failure_event_types), 0),
					NULL
				) as observed_failure_event_types,
				if(
					any(payment_metrics_in_scope) = 1,
					toUInt8(${STRIPE_FAILURE_WEBHOOK_EVENTS.length}),
					NULL
				) as required_failure_event_types,
				if(
					any(payment_metrics_in_scope) = 1,
					arrayElement(
						topKIf(1)(
							attempts.failure_reason,
							attempts.status = 'failed' AND attempts.failure_reason != ''
						),
						1
					),
					NULL
				) as top_payment_failure_reason,
				if(
					any(payment_metrics_in_scope) = 1,
					arrayElement(
						topKIf(1)(
							attempts.cancellation_reason,
							attempts.status = 'canceled' AND attempts.cancellation_reason != ''
						),
						1
					),
					NULL
				) as top_payment_cancellation_reason,
				if(
					any(payment_metrics_in_scope) = 1,
					round(
						100 * failed_payment_attempts /
						nullIf(failed_payment_attempts + successful_payment_attempts, 0),
						2
					),
					NULL
				) as payment_failure_rate`,
			groupBy: "currency",
		})),
		timeField: "created",
		customizable: false,
	},

	revenue_time_series: {
		allowedFilters: REVENUE_ALLOWED_FILTERS,
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
		},
		customSql: makeRevenueBuilder(() => ({
			select: `SELECT
				toDate(toTimeZone(created, {timezone:String})) as date,
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Provider",
			description: "Revenue breakdown by payment provider.",
			category: "Revenue",
			tags: ["revenue", "provider"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: [...REVENUE_ALLOWED_FILTERS, "product_id", "product_name"],
		meta: {
			title: "Revenue by Product",
			description:
				"Gross settled revenue grouped by recorded name, ID and provider, excluding refunds. Names may be payment descriptions rather than catalog products; a limited table cannot establish absence.",
			category: "Revenue",
			tags: ["revenue", "product"],
			output_fields: [
				{ name: "name", type: "string", label: "Product" },
				{ name: "product_id", type: "string", label: "Product ID" },
				{ name: "provider", type: "string", label: "Provider" },
				{ name: "currency", type: "string", label: "Currency" },
				{ name: "revenue", type: "number", label: "Revenue" },
				{ name: "transactions", type: "number", label: "Transactions" },
				{ name: "customers", type: "number", label: "Customers" },
				{ name: "percentage", type: "number", label: "Share", unit: "%" },
			],
			default_visualization: "table",
		},
		customSql: makeRevenueBuilder(
			(limit) => ({
				select: `SELECT
				coalesce(product_name, 'Unknown') as name,
				product_id,
				revenue_provider as provider,${REVENUE_METRICS}`,
				groupBy: "revenue_provider, product_name, product_id, currency",
				orderBy: "revenue DESC",
				limit,
				extraConditions: ["type != 'refund'"],
			}),
			50
		),
		timeField: "created",
		customizable: true,
	},

	revenue_attribution_overview: {
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue Attribution Overview",
			description: "Attributed vs unattributed revenue split.",
			category: "Revenue",
			tags: ["revenue", "attribution"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Country",
			description: "Attributed revenue breakdown by country.",
			category: "Revenue",
			tags: ["revenue", "country", "geo"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Region",
			description: "Attributed revenue breakdown by region/state.",
			category: "Revenue",
			tags: ["revenue", "region", "geo"],
			output_fields: REVENUE_GEO_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by City",
			description: "Attributed revenue breakdown by city.",
			category: "Revenue",
			tags: ["revenue", "city", "geo"],
			output_fields: REVENUE_GEO_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Browser",
			description: "Attributed revenue breakdown by browser.",
			category: "Revenue",
			tags: ["revenue", "browser"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Device",
			description: "Attributed revenue breakdown by device type.",
			category: "Revenue",
			tags: ["revenue", "device"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by OS",
			description: "Attributed revenue breakdown by operating system.",
			category: "Revenue",
			tags: ["revenue", "os"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Referrer",
			description: "Attributed revenue breakdown by referrer domain.",
			category: "Revenue",
			tags: ["revenue", "referrer"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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

	revenue_by_ai_product: {
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by AI Product",
			description:
				"Attributed revenue from visitors sent by AI products (ChatGPT, Claude, Perplexity and others) through referrals or their desktop app browser.",
			category: "Revenue",
			tags: ["revenue", "ai", "referrer", "chatgpt", "claude"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
		},
		customSql: ({
			websiteId,
			startDate,
			endDate,
			filters,
			limit,
			filterParams,
		}) => {
			const query = buildRevenueQuery(
				{
					select: `SELECT
				ai_product as name,${REVENUE_METRICS}`,
					groupBy: "ai_product, currency",
					orderBy: "revenue DESC",
					limit: limit ?? 20,
					innerCte: {
						name: "ai_product_agg",
						body: (source) => `
						SELECT * FROM (
							SELECT
								${aiVisitProduct("replaceRegexpOne(referrer_domain, '^www\\\\.', '')")} as ai_product,
								currency,
								amount,
								type,
								r_customer_id
							FROM ${source}
						)
						WHERE ai_product != ''
					`,
					},
				},
				websiteId,
				startDate,
				endDate,
				filters,
				filterParams
			);
			return { ...query, params: { ...query.params, ...AI_VISIT_PARAMS } };
		},
		timeField: "created",
		customizable: false,
	},

	revenue_by_utm_source: {
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by UTM Source",
			description: "Attributed revenue breakdown by UTM source.",
			category: "Revenue",
			tags: ["revenue", "utm", "source"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by UTM Medium",
			description: "Attributed revenue breakdown by UTM medium.",
			category: "Revenue",
			tags: ["revenue", "utm", "medium"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by UTM Campaign",
			description: "Attributed revenue breakdown by UTM campaign.",
			category: "Revenue",
			tags: ["revenue", "utm", "campaign"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
		meta: {
			title: "Revenue by Entry Page",
			description: "Attributed revenue breakdown by entry page path.",
			category: "Revenue",
			tags: ["revenue", "entry", "page"],
			output_fields: REVENUE_BREAKDOWN_FIELDS,
			default_visualization: "table",
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
		allowedFilters: REVENUE_ALLOWED_FILTERS,
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
				{ name: "attribution_method", type: "string", label: "Match Method" },
				{ name: "unmatched_reason", type: "string", label: "Unmatched Reason" },
				{ name: "country", type: "string", label: "Country" },
				{ name: "browser_name", type: "string", label: "Browser" },
				{ name: "device_type", type: "string", label: "Device" },
				{ name: "referrer", type: "string", label: "Referrer" },
				{ name: "utm_source", type: "string", label: "UTM Source" },
				{ name: "utm_campaign", type: "string", label: "UTM Campaign" },
			],
			default_visualization: "table",
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
				attribution_method,
				unmatched_reason,
				${dimensionCase("country", "Unknown")} as country,
				${dimensionCase("browser_name", "Unknown")} as browser_name,
				${dimensionCase("device_type", "Unknown")} as device_type,
				${dimensionCase("referrer_domain", "Direct")} as referrer,
				${dimensionCase("utm_source", "None")} as utm_source,
				${dimensionCase("utm_campaign", "None")} as utm_campaign`,
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
} satisfies Record<string, SimpleQueryConfig>;
