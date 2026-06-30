import { Analytics } from "../../types/tables";
import { escapeLikePattern } from "../simple-builder";
import type { CustomSqlFn, Filter, SimpleQueryConfig } from "../types";

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
	provider: "provider",
	type: "type",
};

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
	const aliasedScope = orgScope
		? "(r.owner_id = {organizationId:String} OR r.website_id IN {websiteIds:Array(String)})"
		: "(r.owner_id = {websiteId:String} OR r.website_id = {websiteId:String})";

	return `
		pi_dedup AS (
			SELECT amount, toUnixTimestamp(created) as ts
			FROM ${Analytics.revenue}
			WHERE
				${directScope}
				AND created >= toDateTime({startDate:String})
				AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND startsWith(transaction_id, 'pi_')
				AND amount > 0
		),
		revenue_base AS (
			SELECT
				r.transaction_id,
				r.amount,
				r.type,
				r.anonymous_id as r_anonymous_id,
				r.session_id as r_session_id,
				r.customer_id as r_customer_id,
				r.product_id,
				r.product_name,
				r.provider,
				r.created
			FROM ${Analytics.revenue} r
			WHERE
				${aliasedScope}
				AND r.created >= toDateTime({startDate:String})
				AND r.created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				AND r.type != 'subscription_event'
				AND NOT (
					startsWith(r.transaction_id, 'in_')
					AND (
						(r.amount, toUnixTimestamp(r.created)) IN (SELECT amount, ts FROM pi_dedup)
						OR (r.amount, toUnixTimestamp(r.created) + 1) IN (SELECT amount, ts FROM pi_dedup)
						OR (r.amount, toUnixTimestamp(r.created) - 1) IN (SELECT amount, ts FROM pi_dedup)
					)
				)
		),
		active_customers AS (
			SELECT DISTINCT r_customer_id as customer_id
			FROM revenue_base
			WHERE r_customer_id IS NOT NULL AND r_customer_id != ''
		),
		customer_session_map AS (
			SELECT
				r.customer_id as customer_id,
				argMin(r.session_id, r.created) as mapped_session_id
			FROM ${Analytics.revenue} r
			INNER JOIN active_customers ac ON r.customer_id = ac.customer_id
			WHERE ${aliasedScope}
				AND r.customer_id IS NOT NULL AND r.customer_id != ''
				AND r.session_id IS NOT NULL AND r.session_id != ''
			GROUP BY r.customer_id
		),
		attributed_sessions AS (
			SELECT r_session_id AS session_id FROM revenue_base
			WHERE r_session_id IS NOT NULL AND r_session_id != ''
			UNION DISTINCT
			SELECT mapped_session_id AS session_id FROM customer_session_map
			WHERE mapped_session_id IS NOT NULL AND mapped_session_id != ''
		),
		first_touch_by_session AS (
			SELECT
				session_id,
				argMin(country, time) as first_country,
				argMin(region, time) as first_region,
				argMin(city, time) as first_city,
				argMin(browser_name, time) as first_browser,
				argMin(device_type, time) as first_device,
				argMin(os_name, time) as first_os,
				argMin(domain(referrer), time) as first_referrer,
				argMin(utm_source, time) as first_utm_source,
				argMin(utm_medium, time) as first_utm_medium,
				argMin(utm_campaign, time) as first_utm_campaign,
				argMin(path, time) as first_path
			FROM ${Analytics.events}
			WHERE client_id = {websiteId:String}
				AND session_id IN (SELECT session_id FROM attributed_sessions)
				AND time >= toDateTime({startDate:String}) - INTERVAL 90 DAY
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
				rb.provider,
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
			LEFT JOIN customer_session_map csm
				ON rb.r_customer_id = csm.customer_id
				AND rb.r_customer_id IS NOT NULL
				AND rb.r_customer_id != ''
				AND ft_direct.session_id = ''
			LEFT JOIN first_touch_by_session ft_customer
				ON csm.mapped_session_id = ft_customer.session_id
				AND csm.mapped_session_id IS NOT NULL
				AND csm.mapped_session_id != ''
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
	const fromExpr = config.innerCte ? config.innerCte.name : filteredSource;

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
		sumIf(amount, type != 'refund') as revenue,
		countIf(type != 'refund') as transactions,
		uniq(r_customer_id) as customers,
		ROUND((sumIf(amount, type != 'refund') / nullIf(SUM(sumIf(amount, type != 'refund')) OVER(), 0)) * 100, 2) as percentage`;

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
	{ name: "revenue", type: "number" as const, label: "Revenue" },
	{ name: "transactions", type: "number" as const, label: "Transactions" },
	{ name: "customers", type: "number" as const, label: "Customers" },
	{ name: "percentage", type: "number" as const, label: "Share", unit: "%" },
];

const REVENUE_GEO_BREAKDOWN_FIELDS = [
	{ name: "name", type: "string" as const, label: "Name" },
	{ name: "country", type: "string" as const, label: "Country" },
	{ name: "revenue", type: "number" as const, label: "Revenue" },
	{ name: "transactions", type: "number" as const, label: "Transactions" },
	{ name: "customers", type: "number" as const, label: "Customers" },
	{ name: "percentage", type: "number" as const, label: "Share", unit: "%" },
];

export const RevenueBuilders: Record<string, SimpleQueryConfig> = {
	revenue_overview: {
		meta: {
			title: "Revenue Overview",
			description:
				"Aggregate revenue, refund, subscription, and attribution totals.",
			category: "Revenue",
			tags: ["revenue", "overview", "summary"],
			output_fields: [
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
			],
			default_visualization: "metric",
			version: "1.0",
		},
		customSql: makeRevenueBuilder(() => ({
			select: `SELECT
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
				sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue`,
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
				sumIf(amount, type != 'refund') as revenue,
				countIf(type != 'refund') as transactions,
				uniq(r_customer_id) as customers,
				sumIf(amount, type = 'refund') as refund_amount,
				countIf(type = 'refund') as refund_count,
				sumIf(amount, is_attributed = 1 AND type != 'refund') as attributed_revenue,
				countIf(is_attributed = 1 AND type != 'refund') as attributed_transactions`,
			groupBy: "date",
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
				provider as name,${REVENUE_METRICS}`,
			groupBy: "provider",
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
				groupBy: "product_name, product_id",
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
			groupBy: "is_attributed",
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
				groupBy: "name",
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
				groupBy: "name, country",
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
				groupBy: "name, country",
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
				groupBy: "name",
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
				groupBy: "name",
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
				groupBy: "name",
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
				groupBy: "referrer_name",
				orderBy: "revenue DESC",
				limit,
				innerCte: {
					name: "referrer_agg",
					body: (source) => `
						SELECT
							${dimensionCase("referrer_domain", "Direct")} as referrer_name,
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
				groupBy: "name",
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
				groupBy: "name",
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
				groupBy: "name",
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
				groupBy: "name",
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
				provider,
				type,
				amount,
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
