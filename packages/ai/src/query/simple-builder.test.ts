import { describe, expect, it } from "vitest";
import { QueryBuilders } from "./builders";
import {
	getClickHouseQuerySettings,
	SimpleQueryBuilder,
} from "./simple-builder";
import type { Filter, QueryRequest, SimpleQueryConfig } from "./types";
import { applyPlugins } from "./utils";

function makeRequest(overrides: Partial<QueryRequest> = {}): QueryRequest {
	return {
		projectId: "test-site-id",
		type: "test",
		from: "2026-04-01",
		to: "2026-04-11",
		...overrides,
	};
}

function makeConfig(overrides: Partial<SimpleQueryConfig> = {}): SimpleQueryConfig {
	return {
		table: "analytics.events",
		fields: ["count() as total"],
		groupBy: ["path"],
		orderBy: "total DESC",
		limit: 10,
		...overrides,
	};
}

const FILTER_OPERATORS = [
	"eq",
	"ne",
	"contains",
	"not_contains",
	"starts_with",
	"in",
	"not_in",
] as const satisfies readonly Filter["op"][];

const TIME_UNITS: NonNullable<QueryRequest["timeUnit"]>[] = [
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"hourly",
	"daily",
];

const GLOBAL_FILTER_FIELDS = [
	"path",
	"query_string",
	"country",
	"region",
	"city",
	"timezone",
	"language",
	"device_type",
	"browser_name",
	"os_name",
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
] as const;

const NUMERIC_PROFILE_FILTER_FIELDS = new Set([
	"session_count",
	"total_events",
	"unique_pages",
]);

const QUERY_BUILDER_ENTRIES = Object.entries(QueryBuilders);
const FILTERABLE_BUILDER_CASES = QUERY_BUILDER_ENTRIES.flatMap(
	([type, config]) =>
		(config.allowedFilters ?? []).flatMap((field) =>
			FILTER_OPERATORS.filter((op) => isSensibleFilterOperator(field, op)).map(
				(op) => ({ config, field, op, type })
			)
		)
);

function filterValueForOperator(field: string, op: Filter["op"]): Filter["value"] {
	if (NUMERIC_PROFILE_FILTER_FIELDS.has(field)) {
		return op === "in" || op === "not_in" ? [1, 2] : 1;
	}

	return op === "in" || op === "not_in"
		? ["dynamic-value-a", "dynamic-value-b"]
		: "dynamic-value";
}

function makeRequiredFilters(config: SimpleQueryConfig): Filter[] {
	return (config.requiredFilters ?? []).map((field) => ({
		field,
		op: "eq",
		value: `${field}-required-value`,
	}));
}

function isSensibleFilterOperator(field: string, op: Filter["op"]): boolean {
	// These builders fetch a single entity from a scalar id read directly by customSql.
	if ((field === "anonymous_id" || field === "session_id") && op !== "eq") {
		return false;
	}
	if (
		NUMERIC_PROFILE_FILTER_FIELDS.has(field) &&
		(op === "contains" || op === "not_contains" || op === "starts_with")
	) {
		return false;
	}
	return true;
}

function compileBuilder(
	type: string,
	config: SimpleQueryConfig,
	overrides: Partial<QueryRequest> = {}
) {
	return new SimpleQueryBuilder(
		config,
		makeRequest({
			filters: makeRequiredFilters(config),
			type,
			...overrides,
		})
	).compile();
}

function compile(
	config: Partial<SimpleQueryConfig> = {},
	request: Partial<QueryRequest> = {},
	domain?: string | null
) {
	return new SimpleQueryBuilder(
		makeConfig(config),
		makeRequest(request),
		domain
	).compile();
}

describe("SimpleQueryBuilder.compile", () => {
	it.each(QUERY_BUILDER_ENTRIES)(
		"compiles %s with its required filters",
		(type, config) => {
			const { params, sql } = compileBuilder(type, config);

			expect(sql).toContain("SELECT");
			expect(Object.values(params)).toContain("test-site-id");
			for (const filter of makeRequiredFilters(config)) {
				expect(Object.values(params)).toContain(filter.value);
			}
		}
	);

	it.each(QUERY_BUILDER_ENTRIES)(
		"compiles %s for organization-scoped website ids",
		(type, config) => {
			const { params, sql } = compileBuilder(type, config, {
				organizationWebsiteIds: ["site-a", "site-b"],
				projectId: "org-id",
			});

			expect(sql).toContain("SELECT");
			expect(params.websiteIds).toEqual(["site-a", "site-b"]);
		}
	);

	it.each(
		QUERY_BUILDER_ENTRIES.flatMap(([type, config]) =>
			TIME_UNITS.map((timeUnit) => ({ config, timeUnit, type }))
		)
	)("compiles $type with $timeUnit granularity", ({ config, timeUnit, type }) => {
		const { sql } = compileBuilder(type, config, { timeUnit });
		expect(sql).toContain("SELECT");
	});

	it.each(
		GLOBAL_FILTER_FIELDS.flatMap((field) =>
			FILTER_OPERATORS.map((op) => ({ field, op }))
		)
	)("allows global filter $field with $op", ({ field, op }) => {
		const filters: Filter[] = [
			{ field, op, value: filterValueForOperator(field, op) },
		];

		expect(() => compile({}, { filters })).not.toThrow();
	});

	it.each(FILTERABLE_BUILDER_CASES)(
		"allows $type filter $field with $op",
		({ config, field, op, type }) => {
			const filters: Filter[] = [
				...makeRequiredFilters(config),
				{ field, op, value: filterValueForOperator(field, op) },
			];

			const { sql } = compileBuilder(type, config, { filters });
			expect(sql).toContain("SELECT");
		}
	);

	it.each(
		QUERY_BUILDER_ENTRIES.filter(([, config]) => config.requiredFilters?.length)
	)(
		"rejects %s when any required filter is missing",
		(type, config) => {
			expect(() =>
				new SimpleQueryBuilder(config, makeRequest({ type })).compile()
			).toThrow("Missing required filter");
		}
	);

	it("produces a valid SELECT with tenant filter and date range", () => {
		const { sql, params } = compile();
		expect(sql).toContain("client_id = {websiteId:String}");
		expect(sql).toContain("FROM analytics.events");
		expect(sql).toContain("GROUP BY path");
		expect(sql).toContain("ORDER BY total DESC");
		expect(sql).toContain("LIMIT 10");
		expect(params.websiteId).toBe("test-site-id");
	});

	it("uses all organization website ids for org-scoped standard queries", () => {
		const { sql, params } = compile(
			{},
			{
				projectId: "org-id",
				organizationWebsiteIds: ["site-a", "site-b"],
			}
		);

		expect(sql).toContain("client_id IN {websiteIds:Array(String)}");
		expect(sql).not.toContain("client_id = {websiteId:String}");
		expect(params.websiteIds).toEqual(["site-a", "site-b"]);
	});

	it("rewrites custom SQL website filters for org scope", () => {
		const { sql, params } = compile(
			{
				customSql: (websiteId, startDate, endDate) => ({
					sql: `
						SELECT count() as total
						FROM analytics.events e
						WHERE e.client_id = {websiteId:String}
							AND e.time >= toDateTime({startDate:String})
							AND e.time <= toDateTime({endDate:String})
					`,
					params: { websiteId, startDate, endDate },
				}),
			},
			{
				projectId: "org-id",
				organizationWebsiteIds: ["site-a", "site-b"],
			}
		);

		expect(sql).toContain("e.client_id IN {websiteIds:Array(String)}");
		expect(sql).not.toContain("e.client_id = {websiteId:String}");
		expect(params.websiteIds).toEqual(["site-a", "site-b"]);
	});

	it("applies eq filter with parameterized value", () => {
		const filters: Filter[] = [{ field: "country", op: "eq", value: "US" }];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("country = {f0:String}");
		expect(params.f0).toBe("US");
	});

	it("applies ne filter", () => {
		const filters: Filter[] = [{ field: "country", op: "ne", value: "US" }];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("country != {f0:String}");
		expect(params.f0).toBe("US");
	});

	it("applies contains filter with LIKE and escaped pattern", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "/blog" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("LIKE {f0:String}");
		expect(params.f0).toBe("%/blog%");
	});

	it("applies not_contains filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "not_contains", value: "/admin" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("NOT LIKE {f0:String}");
	});

	it("applies starts_with filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "starts_with", value: "/docs" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("LIKE {f0:String}");
		expect(params.f0).toBe("/docs%");
	});

	it("applies in filter with array param", () => {
		const filters: Filter[] = [
			{ field: "country", op: "in", value: ["US", "UK", "DE"] },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("IN {f0:Array(String)}");
		expect(params.f0).toEqual(["US", "UK", "DE"]);
	});

	it("applies not_in filter", () => {
		const filters: Filter[] = [
			{ field: "country", op: "not_in", value: ["CN", "RU"] },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("NOT IN {f0:Array(String)}");
	});

	it("escapes LIKE special characters in contains filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "100%" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%100\\%%");
	});

	it("escapes underscores in LIKE patterns", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "test_page" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%test\\_page%");
	});

	it("escapes backslashes in LIKE patterns", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "a\\b" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%a\\\\b%");
	});

	it("handles desktop device_type filter (empty string OR desktop)", () => {
		const filters: Filter[] = [
			{ field: "device_type", op: "eq", value: "desktop" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain(
			"(device_type = '' OR lower(device_type) = {f0:String})"
		);
		expect(params.f0).toBe("desktop");
	});

	it("handles mobile device_type filter", () => {
		const filters: Filter[] = [
			{ field: "device_type", op: "eq", value: "mobile" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("lower(device_type) = {f0:String}");
		expect(params.f0).toBe("mobile");
	});

	it("silently skips disallowed filter fields rather than throwing", () => {
		const filters: Filter[] = [
			{ field: "secret_col", op: "eq", value: "x" },
		];
		// Unsupported filter fields are skipped so that a multi-query batch
		// (e.g. an "href" filter valid for outbound_links but not for "country")
		// does not break unrelated queries.
		const { sql } = compile({ allowedFilters: ["country"] }, { filters });
		expect(sql).not.toContain("secret_col");
	});

	it("silently skips unknown filter fields when allowedFilters is not configured", () => {
		const filters: Filter[] = [
			{ field: "unknown_field", op: "eq", value: "x" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).not.toContain("unknown_field");
	});

	it("silently skips SQL injection attempts in filter field names", () => {
		// Injection field names are not in the allowed set so they are skipped,
		// meaning no unsafe SQL ever reaches ClickHouse.
		const injectionAttempts = [
			"'; DROP TABLE analytics.events; --",
			"country UNION SELECT * FROM system.tables--",
			"1=1",
			"path; DELETE FROM",
		];
		for (const field of injectionAttempts) {
			const filters: Filter[] = [{ field, op: "eq", value: "x" }];
			const { sql } = compile({}, { filters });
			expect(sql).not.toContain(field);
		}
	});

	it("allows globally allowed filters even when allowedFilters is set", () => {
		const filters: Filter[] = [
			{ field: "country", op: "eq", value: "US" },
		];
		expect(() =>
			compile({ allowedFilters: ["custom_field"] }, { filters })
		).not.toThrow();
	});

	it("allows globally allowed filters when allowedFilters is not configured", () => {
		const filters: Filter[] = [
			{ field: "country", op: "eq", value: "US" },
			{ field: "path", op: "contains", value: "/blog" },
			{ field: "referrer", op: "eq", value: "google" },
		];
		expect(() => compile({}, { filters })).not.toThrow();
	});

	it("throws when a required filter is missing", () => {
		expect(() => compile({ requiredFilters: ["session_id"] })).toThrow(
			"Missing required filter: 'session_id'."
		);
	});

	it("skips 'href' filter on a query type that does not allow it (regression: outbound filter in mixed batch)", () => {
		// When a user has an href filter active on the outbound links view, all
		// batch queries receive that filter. Queries that don't declare "href" in
		// allowedFilters (e.g. country, top_pages) should compile without error
		// and simply omit the href condition from their WHERE clause.
		const filters: Filter[] = [
			{ field: "href", op: "eq", value: "https://example.com" },
			{ field: "country", op: "eq", value: "US" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).not.toContain("href");
		expect(sql).toContain("country");
	});

	function whereClauseOf(sql: string): string {
		const whereIdx = sql.indexOf("WHERE");
		expect(whereIdx).toBeGreaterThanOrEqual(0);
		const groupIdx = sql.indexOf("GROUP BY", whereIdx);
		const orderIdx = sql.indexOf("ORDER BY", whereIdx);
		const limitIdx = sql.indexOf("LIMIT", whereIdx);
		const candidates = [groupIdx, orderIdx, limitIdx].filter((i) => i >= 0);
		const endIdx = candidates.length ? Math.min(...candidates) : sql.length;
		return sql.slice(whereIdx, endIdx);
	}

	it("skips having filters from the outer WHERE clause", () => {
		const filters: Filter[] = [
			{ field: "country", op: "eq", value: "US" },
			{ field: "path", op: "eq", value: "/checkout", having: true },
		];

		const { sql, params } = compile({}, { filters });

		const whereClause = whereClauseOf(sql);
		expect(whereClause).toContain("country = {f0:String}");
		expect(whereClause).not.toMatch(/\bpath\b/);
		expect(sql).toMatch(/HAVING[\s\S]*path[\s\S]*\{f\d+:String\}/);
		expect(params.f0).toBe("US");
	});

	it("skips target-scoped filters from the outer WHERE clause", () => {
		const filters: Filter[] = [
			{ field: "country", op: "eq", value: "US" },
			{ field: "path", op: "eq", value: "/checkout", target: "my_cte" },
		];

		const { sql } = compile({}, { filters });

		const whereClause = whereClauseOf(sql);
		expect(whereClause).toContain("country = {f0:String}");
		expect(whereClause).not.toMatch(/\bpath\b/);
	});

	it("allows a configured required filter when present", () => {
		const filters: Filter[] = [
			{ field: "session_id", op: "eq", value: "session-1" },
		];

		const { sql, params } = compile(
			{
				allowedFilters: ["session_id"],
				requiredFilters: ["session_id"],
			},
			{ filters }
		);

		expect(sql).toContain("session_id = {f0:String}");
		expect(params.f0).toBe("session-1");
	});

	it("applies profile_list profile_id filters for identified-user views", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "profile_id", op: "ne", value: "" }],
				type: "profile_list",
			})
		).compile();

		expect(sql).toContain("profile_id != {f0:String}");
		expect(params.f0).toBe("");
	});

	it("applies profile_list event_name filters through a custom-events visitor subquery", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "event_name", op: "eq", value: "signup" }],
				type: "profile_list",
			})
		).compile();

		expect(sql).toContain(
			"AND if(profile_id != '', profile_id, anonymous_id) IN ("
		);
		expect(sql).toContain(
			"SELECT DISTINCT coalesce(nullIf(profile_id, ''), nullIf(anonymous_id, ''))"
		);
		expect(sql).toContain("FROM analytics.custom_events");
		expect(sql).toContain("AND event_name = {f0:String}");
		expect(sql).not.toContain("eventNameFilter");
		expect(params.f0).toBe("signup");
	});

	it.each([
		"custom_events",
		"custom_events_by_path",
		"custom_events_trends",
		"custom_events_summary",
		"custom_events_discovery",
	])("counts users by canonical profile-first identity in %s", (type) => {
		const config = QueryBuilders[type];
		if (!config) {
			throw new Error(`${type} builder is missing`);
		}

		const { sql } = compileBuilder(type, config);

		expect(sql).toContain(
			"uniq(coalesce(nullIf(profile_id, ''), nullIf(anonymous_id, ''))) as unique_users"
		);
		expect(sql).not.toContain("ifNull(anonymous_id, '')");
		expect(sql).not.toContain("uniq(anonymous_id)");
	});

	it("keeps profile_list event_name operator semantics in the custom-events subquery", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "event_name", op: "contains", value: "signup" }],
				type: "profile_list",
			})
		).compile();

		expect(sql).toContain("AND event_name LIKE {f0:String}");
		expect(params.f0).toBe("%signup%");
	});

	it("applies profile_list aggregate filters in HAVING with numeric params", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "session_count", op: "not_in", value: [1, 2] }],
				type: "profile_list",
			})
		).compile();

		expect(sql).toContain("HAVING session_count NOT IN {f0:Array(Float64)}");
		expect(sql).not.toContain("session_count NOT IN {f0:Array(String)}");
		expect(params.f0).toEqual([1, 2]);
	});

	it("keeps profile_list aggregate filters aligned after skipped unsupported filters", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [
					{ field: "href", op: "eq", value: "https://example.com" },
					{ field: "session_count", op: "eq", value: 5 },
				],
				type: "profile_list",
			})
		).compile();

		expect(sql).toContain("HAVING session_count = {f1:Float64}");
		expect(sql).not.toContain("AND session_count = {f1:String}");
		expect(params.f1).toBe(5);
	});

	it("rejects text operators for profile_list aggregate filters", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}

		expect(() =>
			new SimpleQueryBuilder(
				config,
				makeRequest({
					filters: [
						{ field: "session_count", op: "contains", value: "1" },
					],
					type: "profile_list",
				})
			).compile()
		).toThrow("supports only eq, ne, in, and not_in operators");
	});

	it("allows anonymous_id for the profile_detail builder", () => {
		const config = QueryBuilders.profile_detail;
		if (!config) {
			throw new Error("profile_detail builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "anonymous_id", op: "eq", value: "visitor-1" }],
				type: "profile_detail",
			})
		);

		const { params, sql } = builder.compile();
		expect(sql).toContain("anonymous_id = {visitorId:String}");
		expect(params.visitorId).toBe("visitor-1");
	});

	it("requires anonymous_id for profile detail queries", () => {
		const config = QueryBuilders.profile_detail;
		if (!config) {
			throw new Error("profile_detail builder is missing");
		}

		expect(() =>
			new SimpleQueryBuilder(
				config,
				makeRequest({ type: "profile_detail" })
			).compile()
		).toThrow("Missing required filter: 'anonymous_id'.");
	});

	it("allows anonymous_id for the profile_sessions builder", () => {
		const config = QueryBuilders.profile_sessions;
		if (!config) {
			throw new Error("profile_sessions builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({
				filters: [{ field: "anonymous_id", op: "eq", value: "visitor-1" }],
				type: "profile_sessions",
			})
		);

		const { params, sql } = builder.compile();
		expect(sql).toContain("anonymous_id = {visitorId:String}");
		expect(params.visitorId).toBe("visitor-1");
	});

	it("requires session_id for the session_events builder", () => {
		const config = QueryBuilders.session_events;
		if (!config) {
			throw new Error("session_events builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({ type: "session_events" })
		);

		expect(() => builder.compile()).toThrow(
			"Missing required filter: 'session_id'."
		);
	});

	it("throws on SQL injection in groupBy", () => {
		expect(() =>
			compile({}, { groupBy: ["path; DROP TABLE analytics.events"] })
		).toThrow("not permitted");
	});

	it("throws on SQL injection in orderBy", () => {
		expect(() =>
			compile({}, { orderBy: "total DESC; DELETE FROM analytics.events" })
		).toThrow("not permitted");
	});

	it("defaults bare orderBy field to DESC", () => {
		const { sql } = compile({}, { orderBy: "visitors" });
		expect(sql).toContain("ORDER BY visitors DESC");
	});

	it("normalizes lowercase orderBy direction", () => {
		const { sql } = compile({}, { orderBy: "visitors asc" });
		expect(sql).toContain("ORDER BY visitors ASC");
	});

	it("throws on unknown bare orderBy field", () => {
		expect(() => compile({}, { orderBy: "evil_field" })).toThrow(
			"not permitted"
		);
	});

	it("normalizes referrer filter values", () => {
		const filters: Filter[] = [
			{ field: "referrer", op: "eq", value: "google" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("https://google.com");
	});

	it("normalizes common referrer aliases for filters", () => {
		const xFilter: Filter[] = [{ field: "referrer", op: "eq", value: "x.com" }];
		const linkedinFilter: Filter[] = [
			{ field: "referrer", op: "eq", value: "linkedin" },
		];

		expect(compile({}, { filters: xFilter }).params.f0).toBe(
			"https://twitter.com"
		);
		expect(compile({}, { filters: linkedinFilter }).params.f0).toBe(
			"https://linkedin.com"
		);
	});

	it("uses custom idField when configured", () => {
		const { sql } = compile({ idField: "owner_id" });
		expect(sql).toContain("owner_id = {websiteId:String}");
		expect(sql).not.toContain("client_id");
	});

	it("skips date filter when skipDateFilter is true", () => {
		const { sql } = compile({ skipDateFilter: true });
		expect(sql).not.toContain("toDateTime({from:String})");
	});

	it("normalizes timestamp bounds for ClickHouse date parsing", () => {
		const { sql, params } = compile(
			{},
			{
				from: "2026-04-27 12:00:00Z",
				to: "2026-04-27 13:28:59Z",
			}
		);

		expect(sql).toContain("{from:DateTime}");
		expect(sql).toContain("{to:DateTime}");
		expect(sql).not.toContain("concat({to:String}, ' 23:59:59')");
		expect(params.from).toBe("2026-04-27 12:00:00");
		expect(params.to).toBe("2026-04-27 13:28:59");
		expect(params.timezone).toBeUndefined();
	});

	it("keeps date-only ranges inclusive through the end of the end date", () => {
		const { sql, params } = compile();

		expect(sql).not.toContain("concat({to:String}, ' 23:59:59')");
		expect(params.from).toBe("2026-04-01 00:00:00");
		expect(params.to).toBe("2026-04-11 23:59:59");
	});

	it("cleans date ranges returned by custom SQL builders", () => {
		const { sql, params } = compile(
			{
				customSql: ({ startDate, endDate }) => ({
					sql: `
						SELECT count() as total
						FROM analytics.events
						WHERE time >= toDateTime({startDate:String})
							AND time <= toDateTime({endDate:String})
					`,
					params: {
						startDate,
						endDate: `${endDate} 23:59:59`,
					},
				}),
			},
			{
				from: "2026-04-27T12:00:00.000Z",
				to: "2026-04-27T13:28:59.000Z",
			}
		);

		expect(sql).toContain("{startDate:DateTime}");
		expect(sql).toContain("{endDate:DateTime}");
		expect(params.startDate).toBe("2026-04-27 12:00:00");
		expect(params.endDate).toBe("2026-04-27 13:28:59");
	});

	it("normalizes session attribution builders with timestamp inputs", () => {
		const config = QueryBuilders.summary_metrics;
		if (!config) {
			throw new Error("summary_metrics builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({
				type: "summary_metrics",
				from: "2026-04-27 12:00:00Z",
				to: "2026-04-27 13:28:59Z",
				filters: [{ field: "referrer", op: "eq", value: "google.com" }],
			})
		);

		const { sql, params } = builder.compile();

		expect(sql).toContain("session_attribution AS");
		expect(sql).not.toContain("toDateTime({startDate:String})");
		expect(sql).not.toContain("concat({endDate:String}, ' 23:59:59')");
		expect(params.startDate).toBe("2026-04-27 12:00:00");
		expect(params.endDate).toBe("2026-04-27 13:28:59");
	});

	it("uses session attribution columns for custom SQL filters", () => {
		const config = QueryBuilders.entry_pages;
		if (!config) {
			throw new Error("entry_pages builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({
				type: "entry_pages",
				filters: [{ field: "country", op: "eq", value: "US" }],
			})
		);

		const { sql, params } = builder.compile();

		expect(sql).toContain("session_attribution AS");
		expect(sql).toContain("sa.session_country = {f0:String}");
		expect(sql).not.toContain("\n                    AND country = {f0:String}");
		expect(params.f0).toBe("US");
	});

	it.each(["entry_pages", "exit_pages"])(
		"filters %s by anonymous visitor id",
		(type) => {
			const config = QueryBuilders[type];
			if (!config) {
				throw new Error(`${type} builder is missing`);
			}

			const { params, sql } = new SimpleQueryBuilder(
				config,
				makeRequest({
					filters: [
						{ field: "anonymous_id", op: "eq", value: "visitor-1" },
					],
					type,
				})
			).compile();

			expect(sql).toContain("anonymous_id = {f0:String}");
			expect(sql).toContain("as visitor_id");
			expect(sql).not.toMatch(/arg(?:Min|Max)\([^\n]+\) as anonymous_id/);
			expect(params.f0).toBe("visitor-1");
		}
	);

	it("normalizes standard session attribution queries", () => {
		const { sql, params } = compile(
			{
				plugins: { sessionAttribution: true },
				fields: ["device_type as name", "count() as total"],
				groupBy: ["device_type"],
			},
			{
				from: "2026-04-27 12:00:00Z",
				filters: [{ field: "utm_source", op: "eq", value: "newsletter" }],
				to: "2026-04-27 13:28:59Z",
			}
		);

		expect(sql).toContain("session_attribution AS");
		expect(sql).not.toContain("toDateTime({from:String})");
		expect(sql).not.toContain("concat({to:String}, ' 23:59:59')");
		expect(params.from).toBe("2026-04-27 12:00:00");
		expect(params.to).toBe("2026-04-27 13:28:59");
	});

	it("builds traffic sources with direct visits and session attribution", () => {
		const config = QueryBuilders.traffic_sources;
		if (!config) {
			throw new Error("traffic_sources builder is missing");
		}

		const builder = new SimpleQueryBuilder(
			config,
			makeRequest({
				type: "traffic_sources",
				filters: [{ field: "referrer", op: "eq", value: "google.com" }],
			}),
			"example.com"
		);

		const { sql } = builder.compile();

		expect(sql).toContain("session_attribution AS");
		expect(sql).toContain("e.* REPLACE(");
		expect(sql).toContain("WHEN referrer = '' OR referrer IS NULL");
		expect(sql).toContain("domain(referrer) = ''");
		expect(sql).toContain("domain(referrer) = 'example.com'");
		expect(sql).toContain("domain(referrer) LIKE 'x.com%'");
		expect(sql).toContain("https://linkedin.com");
		expect(sql).toContain("as name");
		expect(sql).toMatch(/\bas percentage\b/i);
		expect(sql).not.toContain("referrer != ''");
	});

	it("canonicalizes and deduplicates parsed traffic source display rows", () => {
		const rows = applyPlugins(
			[
				{ source: "direct", pageviews: 10, visitors: 5, percentage: 50 },
				{
					source: "https://app.example.com",
					pageviews: 6,
					visitors: 3,
					percentage: 30,
				},
				{ name: "https://", pageviews: 1, visitors: 1, percentage: 5 },
				{
					source: "https://google.com",
					pageviews: 4,
					visitors: 2,
					percentage: 20,
				},
			],
			{
				plugins: {
					deduplicateReferrers: true,
					parseReferrers: true,
				},
			},
			"example.com"
		);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			name: "Direct",
			referrer: "direct",
			source: "direct",
			domain: "",
			referrer_type: "direct",
			pageviews: 17,
			visitors: 9,
			percentage: 81.82,
		});
		expect(rows[1]).toMatchObject({
			name: "Google",
			referrer: "https://google.com",
			source: "https://google.com",
			domain: "google.com",
			referrer_type: "search",
			pageviews: 4,
			visitors: 2,
			percentage: 18.18,
		});
	});

	it("deduplicates parsed click-based referrer rows", () => {
		const rows = applyPlugins(
			[
				{ referrer: "https://twitter.com", clicks: 7, percentage: 70 },
				{ referrer: "https://x.com", clicks: 3, percentage: 30 },
			],
			{
				plugins: {
					deduplicateReferrers: true,
					parseReferrers: true,
				},
			}
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			name: "Twitter",
			clicks: 10,
			percentage: 100,
			referrer_type: "social",
		});
	});

	it("builds real session transition flow instead of page popularity", () => {
		const config = QueryBuilders.session_flow;
		if (!config) {
			throw new Error("session_flow builder is missing");
		}

		const { sql } = new SimpleQueryBuilder(
			config,
			makeRequest({ type: "session_flow" })
		).compile();

		expect(sql).toContain("leadInFrame(path)");
		expect(sql).toContain("from_path");
		expect(sql).toContain("to_path");
		expect(sql).toContain("event_name = 'screen_view'");
		expect(sql).not.toContain("event_name = 'pageview'");
	});

	it("counts only page-view sessions in session metrics", () => {
		const config = QueryBuilders.session_metrics;
		if (!config) {
			throw new Error("session_metrics builder is missing");
		}

		const { sql } = compileBuilder("session_metrics", config);

		expect(sql).toContain("countIf(page_views >= 1) as total_sessions");
		expect(sql).toContain(
			"avgIf(duration, page_views >= 1 AND duration > 0)"
		);
		expect(sql).toContain(
			"countIf(page_views = 1 AND duration < 10 AND engagement_events = 0)"
		);
		expect(sql).toContain("nullIf(countIf(page_views >= 1), 0)");
		expect(sql).not.toContain("count() as total_sessions");
		expect(sql).not.toContain("page_views <= 1");
	});

	it("does not expose page time as session duration", () => {
		for (const type of [
			"sessions_by_device",
			"sessions_by_browser",
			"sessions_time_series",
		]) {
			const config = QueryBuilders[type];
			if (!config) {
				throw new Error(`${type} builder is missing`);
			}

			const { sql } = compileBuilder(type, config);
			expect(sql).not.toContain("avg_session_duration");
			expect(sql).not.toContain("time_on_page / 1000");
		}
	});

	it("includes blank-valued desktop sessions in device breakdowns", () => {
		const config = QueryBuilders.sessions_by_device;
		if (!config) {
			throw new Error("sessions_by_device builder is missing");
		}

		const { sql } = compileBuilder("sessions_by_device", config);
		expect(sql).toContain("'Desktop'");
		expect(sql).not.toContain("device_type != ''");
	});

	it("does not calculate page time from screen-view rows", () => {
		const config = QueryBuilders.page_performance;
		if (!config) {
			throw new Error("page_performance builder is missing");
		}

		const { sql } = compileBuilder("page_performance", config);

		expect(sql).toContain("event_name = 'screen_view'");
		expect(sql).not.toContain("avg_time_on_page");
		expect(sql).not.toContain("time_on_page / 1000");
	});

	it("builds interesting sessions with pageview, custom event, and error signals", () => {
		const config = QueryBuilders.interesting_sessions;
		if (!config) {
			throw new Error("interesting_sessions builder is missing");
		}

		const { sql } = new SimpleQueryBuilder(
			config,
			makeRequest({ type: "interesting_sessions", limit: 5 })
		).compile();

		expect(sql).toContain("interesting_score");
		expect(sql).toContain("analytics.custom_events");
		expect(sql).toContain("analytics.error_spans");
		expect(sql).toContain("event_name = 'screen_view'");
		expect(sql).not.toContain("event_name = 'pageview'");
	});

	it("collapses immutable revenue versions in revenue and profile reads", () => {
		for (const type of [
			"revenue_overview",
			"profile_list",
			"profile_revenue",
		]) {
			const config = QueryBuilders[type];
			if (!config) {
				throw new Error(`${type} builder is missing`);
			}
			const { sql } = compileBuilder(type, config);

			expect(sql, type).toContain(
				"GROUP BY owner_id, provider, transaction_id"
			);
			expect(sql, type).toContain("FROM analytics.revenue");
			expect(sql, type).not.toContain("analytics.revenue FINAL");
		}
	});

	it("keeps profile LTV lifetime while activity stays window-scoped", () => {
		const config = QueryBuilders.profile_list;
		if (!config) {
			throw new Error("profile_list builder is missing");
		}
		const { sql } = compileBuilder("profile_list", config);

		expect(sql).toContain("time >= {startDate:DateTime}");
		expect(sql).toContain("timestamp >= {startDate:DateTime}");
		expect(sql).not.toContain("created >= {startDate:DateTime}");
		expect(sql).not.toContain("created <= {endDate:DateTime}");
	});

	it("counts only terminal successful states in revenue totals", () => {
		const config = QueryBuilders.revenue_overview;
		if (!config) {
			throw new Error("revenue_overview builder is missing");
		}
		const { sql } = compileBuilder("revenue_overview", config);

		expect(sql).toContain("r.type = 'refund' AND r.status = 'refunded'");
		expect(sql).toContain("r.type != 'refund' AND r.status = 'completed'");
		expect(sql).toContain("customer_session_map AS");
		expect(sql).toContain(
			"created >= {startDate:DateTime} - INTERVAL 90 DAY"
		);
		expect(sql).toContain("ON rb.provider = csm.provider");
		expect(sql).toContain("legacy_pi_dedup AS");
		expect(sql).toContain("scoped_stripe_invoice_keys AS");
		expect(sql).toContain("stripe_relation_rows AS");
		expect(sql).toContain("linked_payment_intents AS");
		expect(sql).toContain("stripe_invoice_payment_totals AS");
		expect(sql).toContain(
			"JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback'"
		);
		expect(sql).toContain(
			"r.amount - ifNull(invoice_payments.amount, 0)"
		);
		expect(sql).toContain(
			"OR JSONExtractString(r.metadata, 'stripe_money_kind') = 'invoice_fallback'"
		);
		expect(sql).toContain("OR r.linked_website_id = {websiteId:String}");
		expect(sql).toContain(
			"coalesce(r.product_name, nullIf(r.linked_product_name, ''))"
		);
		expect(sql).toContain("stripe_invoice_failure_attempt_keys AS");
		expect(sql).toContain("stripe_payment_attempts AS");
		expect(sql).toContain("startsWith(r.transaction_id, 'in_')");
		expect(sql).toContain(
			"JSONExtractString(r.metadata, 'databuddy_revenue_model') = ''"
		);
		expect(sql).toContain(
			"SELECT payment_intent_id FROM linked_payment_intents"
		);
		expect(sql).toContain("stripe_record_kind') = 'attempt'");
		expect(sql).toContain("recovered_payment_attempts");
	});

	it("keeps revenue attribution transaction-as-of without truncating exact sessions", () => {
		const config = QueryBuilders.recent_transactions;
		if (!config) {
			throw new Error("recent_transactions builder is missing");
		}
		const { sql } = compileBuilder("recent_transactions", config);
		const firstTouchStart = sql.indexOf("first_touch_by_session AS");
		const firstTouchEnd = sql.indexOf("revenue_attributed AS");
		const firstTouchSql = sql.slice(firstTouchStart, firstTouchEnd);

		expect(firstTouchStart).toBeGreaterThan(-1);
		expect(firstTouchEnd).toBeGreaterThan(firstTouchStart);
		expect(firstTouchSql).not.toContain("INTERVAL 90 DAY");
		expect(sql).toContain("min(created) as mapped_session_created");
		expect(sql).toContain("csm.mapped_session_created <= rb.created");
		expect(sql).toContain("min(time) as first_touch_time");
		expect(sql).toContain("ft_direct.first_touch_time <= rb.created");
		expect(sql).toContain("ft_customer.first_touch_time <= rb.created");
		expect(sql).toContain("argMin(ifNull(utm_campaign, ''), time)");
	});

	it("keeps revenue currencies separate and accepts an exact currency filter", () => {
		const config = QueryBuilders.revenue_overview;
		if (!config) {
			throw new Error("revenue_overview builder is missing");
		}
		const { params, sql } = compileBuilder("revenue_overview", config, {
			filters: [{ field: "currency", op: "eq", value: "EUR" }],
		});

		expect(sql).toContain("GROUP BY currency");
		expect(sql).toContain("revenue_attributed WHERE currency = {rf0:String}");
		expect(params.rf0).toBe("EUR");
	});

	it("keeps Stripe payment diagnostics inside the provider scope", () => {
		const config = QueryBuilders.revenue_overview;
		if (!config) {
			throw new Error("revenue_overview builder is missing");
		}

		const paddle = compileBuilder("revenue_overview", config, {
			filters: [{ field: "provider", op: "eq", value: "paddle" }],
		});
		const stripe = compileBuilder("revenue_overview", config, {
			filters: [{ field: "provider", op: "eq", value: "stripe" }],
		});
		const mixed = compileBuilder("revenue_overview", config, {
			filters: [
				{ field: "provider", op: "in", value: ["paddle", "stripe"] },
			],
		});
		const withoutStripe = compileBuilder("revenue_overview", config, {
			filters: [{ field: "provider", op: "ne", value: "stripe" }],
		});
		const attributedSlice = compileBuilder("revenue_overview", config, {
			filters: [{ field: "country", op: "eq", value: "US" }],
		});

		expect(config.allowedFilters).toEqual(["currency", "provider"]);
		expect(paddle.sql).toContain("SELECT * FROM stripe_payment_attempts WHERE 0");
		expect(paddle.sql).toContain(
			"SELECT * FROM stripe_failure_observations WHERE 0"
		);
		expect(paddle.sql).toContain("toUInt8(0) AS payment_metrics_in_scope");
		expect(paddle.sql).toContain(
			"any(payment_metrics_in_scope) as payment_diagnostics_available"
		);
		expect(paddle.sql).toContain(
			"countIf(attempt_status = 'failed'),\n\t\t\t\t\tNULL"
		);
		expect(paddle.params.rf0).toBe("paddle");
		expect(stripe.sql).not.toContain("stripe_payment_attempts WHERE 0");
		expect(stripe.sql).toContain("toUInt8(1) AS payment_metrics_in_scope");
		expect(stripe.params.rf0).toBe("stripe");
		expect(mixed.sql).not.toContain("stripe_payment_attempts WHERE 0");
		expect(mixed.sql).toContain("toUInt8(1) AS payment_metrics_in_scope");
		expect(withoutStripe.sql).toContain(
			"SELECT * FROM stripe_payment_attempts WHERE 0"
		);
		expect(withoutStripe.sql).toContain(
			"toUInt8(0) AS payment_metrics_in_scope"
		);
		expect(attributedSlice.sql).toContain(
			"SELECT * FROM stripe_payment_attempts WHERE 0"
		);
		expect(attributedSlice.sql).toContain(
			"toUInt8(0) AS payment_metrics_in_scope"
		);
	});

	it("builds bounded error fingerprints ranked by affected people", () => {
		const config = QueryBuilders.error_fingerprints;
		if (!config) {
			throw new Error("error_fingerprints builder is missing");
		}

		const { params, sql } = new SimpleQueryBuilder(
			config,
			makeRequest({ type: "error_fingerprints", limit: 500 })
		).compile();

		expect(sql).toContain("es.message as name");
		expect(sql).toContain("GROUP BY es.message");
		expect(sql).toContain(
			"uniqIf(es.anonymous_id, es.anonymous_id != '') as users"
		);
		expect(sql).toContain(
			"uniqIf(es.session_id, es.session_id != '') as sessions"
		);
		expect(sql).toContain("trimRight(path(es.path), '/')");
		expect(sql).toContain("as error_type");
		expect(sql).toContain("as filename");
		expect(sql).toContain("as line");
		expect(sql).toContain(
			"argMax(substring(ifNull(es.stack, ''), 1, 1000), tuple(if(ifNull(es.stack, '') != '', 1, 0), es.timestamp, es.session_id, es.anonymous_id)) as representative_stack"
		);
		expect(sql).toContain("max(es.timestamp) as last_seen");
		expect(sql).toContain(
			"ORDER BY users DESC, sessions DESC, count DESC, last_seen DESC"
		);
		expect(params.limit).toBe(50);
		expect(config.publicAccess).not.toBe(true);
	});

	it("builds scroll depth queries from page_exit percent values", () => {
		const summaryConfig = QueryBuilders.scroll_depth_summary;
		const distributionConfig = QueryBuilders.scroll_depth_distribution;
		const pageConfig = QueryBuilders.page_scroll_performance;
		if (!(summaryConfig && distributionConfig && pageConfig)) {
			throw new Error("scroll depth builders are missing");
		}

		const summarySql = new SimpleQueryBuilder(
			summaryConfig,
			makeRequest({ type: "scroll_depth_summary" })
		).compile().sql;
		const distributionSql = new SimpleQueryBuilder(
			distributionConfig,
			makeRequest({ type: "scroll_depth_distribution" })
		).compile().sql;
		const pageSql = new SimpleQueryBuilder(
			pageConfig,
			makeRequest({ type: "page_scroll_performance" })
		).compile().sql;

		for (const sql of [summarySql, distributionSql, pageSql]) {
			expect(sql).toContain("event_name = 'page_exit'");
			expect(sql).not.toContain("event_name = 'screen_view'");
		}
		expect(summarySql).toContain("scroll_depth ELSE NULL");
		expect(summarySql).not.toContain("scroll_depth * 100");
		expect(pageSql).toContain("scroll_depth ELSE NULL");
		expect(pageSql).not.toContain("scroll_depth * 100");
		expect(distributionSql).toContain("WHEN scroll_depth < 25");
		expect(distributionSql).toContain("WHEN scroll_depth < 100");
		expect(distributionSql).not.toContain("WHEN scroll_depth < 0.25");
	});

	it("applies request limit override", () => {
		const { sql } = compile({ limit: 10 }, { limit: 25 });
		expect(sql).toContain("LIMIT 25");
	});

	it("applies offset", () => {
		const { sql } = compile({}, { offset: 50 });
		expect(sql).toContain("OFFSET 50");
	});
});

describe("getClickHouseQuerySettings", () => {
	it("ignores nondeterministic functions when query cache is enabled", () => {
		expect(getClickHouseQuerySettings()).toEqual({
			query_cache_nondeterministic_function_handling: "ignore",
			use_query_cache: 1,
		});
	});

	it("does not set nondeterministic cache handling when cache is disabled", () => {
		expect(getClickHouseQuerySettings(true)).toEqual({
			use_query_cache: 0,
		});
	});

	it("does not mutate settings for a server-enforced read-only connection", () => {
		const previousUrl = process.env.CLICKHOUSE_URL;
		const previousReadonlyUrl = process.env.CLICKHOUSE_READONLY_URL;
		try {
			process.env.CLICKHOUSE_URL = "https://readonly.example.test";
			process.env.CLICKHOUSE_READONLY_URL =
				"https://readonly.example.test";

			expect(getClickHouseQuerySettings()).toEqual({});
			expect(getClickHouseQuerySettings(true)).toEqual({});
		} finally {
			process.env.CLICKHOUSE_URL = previousUrl;
			process.env.CLICKHOUSE_READONLY_URL = previousReadonlyUrl;
		}
	});
});
