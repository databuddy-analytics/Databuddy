import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { randomUUIDv7 } from "bun";
import { chCommand, chQuery } from "@databuddy/db/clickhouse";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import { ProfilesBuilders } from "./builders/profiles";
import type {
	CompiledQuery,
	Filter,
	QueryRequest,
	SimpleQueryConfig,
} from "./types";

const TEST_CLICKHOUSE_URL = "http://default:@127.0.0.1:8123";

// Bun's fetch rejects userinfo in URLs, so the probe goes credential-free;
// the ClickHouse client parses TEST_CLICKHOUSE_URL itself and is unaffected.
const isClickHouseUp = await fetch("http://127.0.0.1:8123/?query=SELECT+1", {
	signal: AbortSignal.timeout(1500),
})
	.then((response) => response.ok)
	.catch(() => false);

// The db client reads CLICKHOUSE_URL at import time; hard-assign localhost so
// this suite can never touch a real deployment from a developer's .env.
process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
const { clickHouse } = await import("@databuddy/db/clickhouse");

const iit = isClickHouseUp ? it : it.skip;
const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

if (isClickHouseUp) {
	setDefaultTimeout(15_000);
}

if (!isClickHouseUp) {
	console.warn(
		"builder-execution: ClickHouse not reachable on localhost:8123 — EXPLAIN suite skipped"
	);
}

afterAll(async () => {
	// The explicit integration run has more ClickHouse suites after this file.
	// Isolated builder runs still close their client normally.
	if (
		isClickHouseUp &&
		process.env.CLICKHOUSE_INTEGRATION_TESTS !== "true"
	) {
		await clickHouse.close();
	}
});

const NUMERIC_FILTER_FIELDS = new Set([
	"session_count",
	"total_events",
	"unique_pages",
]);

const FILTER_FIELD_OVERRIDES: Partial<
	Record<string, { all: string[]; required: string[] }>
> = {
	error_customer_impact: {
		all: ["message"],
		required: ["message"],
	},
	error_route_continuation_comparison: {
		all: ["message"],
		required: ["message"],
	},
};

function filterFor(field: string): Filter {
	return {
		field,
		op: "eq",
		value: NUMERIC_FILTER_FIELDS.has(field) ? 1 : `test-${field}`,
	};
}

function requestFor(
	name: string,
	config: SimpleQueryConfig,
	fields: string[]
): QueryRequest {
	return {
		projectId: "builder-explain-test",
		type: name,
		from: "2026-01-01",
		to: "2026-01-02",
		filters: fields.map(filterFor),
		limit: 5,
		offset: 0,
	};
}

async function explainCompiles(
	name: string,
	config: SimpleQueryConfig,
	fields: string[]
) {
	const { sql, params } = new SimpleQueryBuilder(
		config,
		requestFor(name, config, fields)
	).compile();

	const result = await clickHouse.query({
		query: `EXPLAIN ${sql}`,
		query_params: params,
		format: "TSVRaw",
	});
	await result.text();

	expect(sql.length).toBeGreaterThan(0);
}

describe("query builders execute against ClickHouse", () => {
	for (const [name, config] of Object.entries(QueryBuilders)) {
		iit(`${name} compiles to valid ClickHouse SQL`, async () => {
			await explainCompiles(
				name,
				config,
				FILTER_FIELD_OVERRIDES[name]?.required ?? config.requiredFilters ?? []
			);
		});

		const allFilters =
			FILTER_FIELD_OVERRIDES[name]?.all ??
			[
				...new Set([
					...(config.requiredFilters ?? []),
					...(config.allowedFilters ?? []),
				]),
			];
		if (allFilters.length > (config.requiredFilters ?? []).length) {
			iit(`${name} compiles with every allowed filter applied`, async () => {
				await explainCompiles(name, config, allFilters);
			});
		}
	}
});

const websiteId = `profile-builder-${randomUUIDv7()}`;
const profileId = "profile-builder-user";
const anonymousId = "profile-builder-anonymous";
const collisionWebsiteId = `profile-builder-collision-${randomUUIDv7()}`;
const collisionProfileA = "profile-builder-collision-a";
const collisionProfileB = "profile-builder-collision-b";
const collisionSessionId = "profile-builder-collision-session";
const customAliasWebsiteId = `profile-builder-custom-alias-${randomUUIDv7()}`;
const customAliasProfileId = "profile-builder-custom-alias-user";
const customAliasAnonymousId = "profile-builder-custom-alias-anonymous";
const customAliasSessionId = "profile-builder-custom-alias-session";

function collisionEvent(
	anonymous_id: string,
	profile_id: string,
	path: string,
	time: string
) {
	return {
		anonymous_id,
		client_id: collisionWebsiteId,
		created_at: time,
		event_name: "screen_view",
		id: randomUUIDv7(),
		path,
		profile_id,
		properties: "{}",
		session_id: collisionSessionId,
		time,
		url: `https://example.test${path}`,
	};
}

function requireQuery(query: string | CompiledQuery | undefined): CompiledQuery {
	if (!query || typeof query === "string") {
		throw new Error("Profile query did not compile");
	}
	return query;
}

describeIntegration("profile query identity against ClickHouse", () => {
	beforeAll(async () => {
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				{
					anonymous_id: anonymousId,
					client_id: websiteId,
					created_at: "2026-08-01 12:00:00",
					event_name: "screen_view",
					id: randomUUIDv7(),
					path: "/before-identify",
					profile_id: "",
					properties: "{}",
					session_id: "profile-builder-session-1",
					time: "2026-08-01 12:00:00",
					url: "https://example.test/before-identify",
				},
				{
					anonymous_id: anonymousId,
					client_id: websiteId,
					created_at: "2026-08-01 12:02:00",
					event_name: "screen_view",
					id: randomUUIDv7(),
					path: "/after-identify",
					profile_id: profileId,
					properties: "{}",
					session_id: "profile-builder-session-1",
					time: "2026-08-01 12:02:00",
					url: "https://example.test/after-identify",
				},
				{
					anonymous_id: anonymousId,
					client_id: websiteId,
					created_at: "2026-08-01 13:00:00",
					event_name: "screen_view",
					id: randomUUIDv7(),
					path: "/return",
					profile_id: profileId,
					properties: "{}",
					session_id: "profile-builder-session-2",
					time: "2026-08-01 13:00:00",
					url: "https://example.test/return",
				},
				{
					anonymous_id: "",
					client_id: websiteId,
					created_at: "2026-08-01 12:03:00",
					event_name: "screen_view",
					id: randomUUIDv7(),
					path: "/session-only",
					profile_id: "",
					properties: "{}",
					session_id: "profile-builder-session-1",
					time: "2026-08-01 12:03:00",
					url: "https://example.test/session-only",
				},
			],
		});

		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: [
				{
					anonymous_id: anonymousId,
					event_name: "identify",
					owner_id: websiteId,
					profile_id: profileId,
					properties: "{}",
					session_id: "profile-builder-session-1",
					timestamp: "2026-08-01 12:01:00",
					website_id: websiteId,
				},
				{
					anonymous_id: "",
					event_name: "session_custom",
					owner_id: websiteId,
					profile_id: "",
					properties: "{}",
					session_id: "profile-builder-session-1",
					timestamp: "2026-08-01 12:04:00",
					website_id: websiteId,
				},
			],
		});

		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: [
				{
					anonymous_id: customAliasAnonymousId,
					event_name: "identify_alias",
					owner_id: customAliasWebsiteId,
					path: "/custom-only-identity",
					profile_id: customAliasProfileId,
					properties: "{}",
					session_id: customAliasSessionId,
					timestamp: "2026-08-01 14:00:00",
					website_id: customAliasWebsiteId,
				},
			],
		});
		await Promise.all([
			clickHouse.insert({
				table: "analytics.error_spans",
				format: "JSONEachRow",
				values: [
					{
						anonymous_id: customAliasAnonymousId,
						client_id: customAliasWebsiteId,
						error_type: "TypeError",
						message: "custom-only alias error",
						path: "/custom-only-identity",
						session_id: customAliasSessionId,
						timestamp: "2026-08-01 14:01:00",
					},
				],
			}),
			clickHouse.insert({
				table: "analytics.outgoing_links",
				format: "JSONEachRow",
				values: [
					{
						anonymous_id: customAliasAnonymousId,
						client_id: customAliasWebsiteId,
						href: "https://example.test/custom-only-link",
						id: randomUUIDv7(),
						properties: "{}",
						session_id: customAliasSessionId,
						text: "custom-only link",
						timestamp: "2026-08-01 14:02:00",
					},
				],
			}),
			clickHouse.insert({
				table: "analytics.web_vitals_spans",
				format: "JSONEachRow",
				values: [
					{
						anonymous_id: customAliasAnonymousId,
						client_id: customAliasWebsiteId,
						metric_name: "LCP",
						metric_value: 1234,
						path: "/custom-only-identity",
						session_id: customAliasSessionId,
						timestamp: "2026-08-01 14:03:00",
					},
				],
			}),
		]);

		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				collisionEvent(
					"profile-builder-collision-anonymous-a",
					"",
					"/collision-a-before",
					"2026-08-01 12:00:00"
				),
				collisionEvent(
					"profile-builder-collision-anonymous-a",
					collisionProfileA,
					"/collision-a-identify",
					"2026-08-01 12:01:00"
				),
				collisionEvent(
					"profile-builder-collision-anonymous-b",
					"",
					"/collision-b-before",
					"2026-08-01 12:02:00"
				),
				collisionEvent(
					"profile-builder-collision-anonymous-b",
					collisionProfileB,
					"/collision-b-identify",
					"2026-08-01 12:03:00"
				),
				collisionEvent(
					"",
					"",
					"/collision-unknown",
					"2026-08-01 12:04:00"
				),
			],
		});
	});

	afterAll(async () => {
		await chCommand(
			"ALTER TABLE analytics.events DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
			{ websiteId }
		);
		await chCommand(
			"ALTER TABLE analytics.custom_events DELETE WHERE owner_id = {websiteId:String} SETTINGS mutations_sync = 1",
			{ websiteId }
		);
		await chCommand(
			"ALTER TABLE analytics.events DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
			{ websiteId: collisionWebsiteId }
		);
		await Promise.all([
			chCommand(
				"ALTER TABLE analytics.custom_events DELETE WHERE owner_id = {websiteId:String} SETTINGS mutations_sync = 1",
				{ websiteId: customAliasWebsiteId }
			),
			chCommand(
				"ALTER TABLE analytics.error_spans DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
				{ websiteId: customAliasWebsiteId }
			),
			chCommand(
				"ALTER TABLE analytics.outgoing_links DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
				{ websiteId: customAliasWebsiteId }
			),
			chCommand(
				"ALTER TABLE analytics.web_vitals_spans DELETE WHERE client_id = {websiteId:String} SETTINGS mutations_sync = 1",
				{ websiteId: customAliasWebsiteId }
			),
		]);
	});

	it("stitches activity and keeps it in the identified profile filter", async () => {
		const query = requireQuery(ProfilesBuilders.profile_list?.customSql?.({
			endDate: "2026-08-02",
			limit: 10,
			offset: 0,
			startDate: "2026-08-01",
			websiteId,
		}));
		const filteredQuery = new SimpleQueryBuilder(ProfilesBuilders.profile_list, {
			filters: [{ field: "profile_id", op: "ne", value: "" }],
			from: "2026-08-01",
			projectId: websiteId,
			to: "2026-08-02",
			type: "profile_list",
		}).compile();

		const [rows, filteredRows] = await Promise.all([
			chQuery<{
				custom_event_count: number | string;
				profile_id: string;
				session_count: number | string;
				total_events: number | string;
				visitor_id: string;
			}>(query.sql, query.params),
			chQuery<{ profile_id: string; total_events: number | string }>(
				filteredQuery.sql,
				filteredQuery.params
			),
		]);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.profile_id).toBe(profileId);
		expect(rows[0]?.visitor_id).toBe(profileId);
		expect(Number(rows[0]?.total_events)).toBe(4);
		expect(Number(rows[0]?.session_count)).toBe(2);
		expect(Number(rows[0]?.custom_event_count)).toBe(2);
		expect(filteredRows).toHaveLength(1);
		expect(filteredRows[0]?.profile_id).toBe(profileId);
		expect(Number(filteredRows[0]?.total_events)).toBe(4);
	});

	it("does not cross-attribute reused sessions between profiles", async () => {
		const listQuery = requireQuery(ProfilesBuilders.profile_list?.customSql?.({
			endDate: "2026-08-02",
			limit: 10,
			offset: 0,
			startDate: "2026-08-01",
			websiteId: collisionWebsiteId,
		}));
		const detailQueries = [collisionProfileA, collisionProfileB].map((id) =>
			requireQuery(ProfilesBuilders.profile_detail?.customSql?.({
				endDate: "2026-08-02",
				filters: [{ field: "anonymous_id", op: "eq", value: id }],
				startDate: "2026-08-01",
				websiteId: collisionWebsiteId,
			}))
		);
		const sessionQueries = [collisionProfileA, collisionProfileB].map((id) =>
			requireQuery(ProfilesBuilders.profile_sessions?.customSql?.({
				endDate: "2026-08-02",
				filters: [{ field: "anonymous_id", op: "eq", value: id }],
				startDate: "2026-08-01",
				websiteId: collisionWebsiteId,
			}))
		);

		const [listRows, detailRows, sessionRows] = await Promise.all([
			chQuery<{ profile_id: string; total_events: number | string }>(
				listQuery.sql,
				listQuery.params
			),
			Promise.all(
				detailQueries.map((query) =>
					chQuery<{ total_pageviews: number | string }>(
						query.sql,
						query.params
					)
				)
			),
			Promise.all(
					sessionQueries.map((query) =>
					chQuery<{
						events: unknown[];
						session_id: string;
					}>(query.sql, query.params)
				)
			),
		]);

		const profileTotals = listRows
			.map((row) => [row.profile_id, Number(row.total_events)] as const)
			.sort(([left], [right]) => left.localeCompare(right));
		expect(profileTotals).toEqual([
			[collisionProfileA, 2],
			[collisionProfileB, 2],
		]);
		expect(detailRows.map((rows) => Number(rows[0]?.total_pageviews))).toEqual([
			2,
			2,
		]);
		expect(sessionRows).toHaveLength(2);
		for (const rows of sessionRows) {
			expect(rows).toHaveLength(1);
			expect(rows[0]?.events).toHaveLength(2);
		}
	});

	it("uses the same stitched identity in profile detail and sessions", async () => {
		const detailQuery = requireQuery(ProfilesBuilders.profile_detail?.customSql?.({
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
			startDate: "2026-08-01",
			websiteId,
		}));
		const sessionsQuery = requireQuery(ProfilesBuilders.profile_sessions?.customSql?.({
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
			startDate: "2026-08-01",
			websiteId,
		}));

		const [detailRows, sessionRows] = await Promise.all([
			chQuery<{ total_pageviews: number | string }>(
				detailQuery.sql,
				detailQuery.params
			),
			chQuery<{ session_id: string }>(sessionsQuery.sql, sessionsQuery.params),
		]);

		expect(Number(detailRows[0]?.total_pageviews)).toBe(4);
		expect(sessionRows).toHaveLength(2);
		expect(new Set(sessionRows.map((row) => row.session_id))).toEqual(
			new Set([
				"profile-builder-session-1",
				"profile-builder-session-2",
			])
		);
		expect(
			sessionRows.find(
				(row) => row.session_id === "profile-builder-session-1"
			)?.events
		).toHaveLength(5);
		expect(
			sessionRows.find(
				(row) => row.session_id === "profile-builder-session-2"
			)?.events
		).toHaveLength(1);
	});

	it("keeps telemetry for an alias established only by a custom event", async () => {
		const query = requireQuery(ProfilesBuilders.profile_sessions?.customSql?.({
			endDate: "2026-08-02",
			filters: [
				{ field: "anonymous_id", op: "eq", value: customAliasProfileId },
			],
			limit: 10,
			offset: 0,
			startDate: "2026-08-01",
			websiteId: customAliasWebsiteId,
		}));
		const rows = await chQuery<{
			events: unknown[];
			session_id: string;
			web_vitals: unknown[];
		}>(query.sql, query.params);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.session_id).toBe(customAliasSessionId);
		expect(
			rows[0]?.events.map((event) =>
				Array.isArray(event) ? [event[2], event[5]] : event
			)
		).toEqual(
			expect.arrayContaining([
				["identify_alias", "custom"],
				["TypeError", "error"],
				["outgoing_link", "outgoing_link"],
			])
		);
		expect(rows[0]?.web_vitals).toHaveLength(1);
		const [vital] = rows[0]?.web_vitals ?? [];
		expect(Array.isArray(vital) ? vital.slice(0, 2) : undefined).toEqual([
			"LCP",
			1234,
		]);
	});
});
