import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { z } from "zod";
import { SimpleQueryBuilder } from "../simple-builder";
import type { Filter, QueryRequest } from "../types";
import { RetentionBuilders } from "./retention";

// Opt-in, credential-free, synthetic local service only. Never use the shared
// runtime client or environment URLs: a developer's credentials cannot redirect it.
const integration =
	process.env.IDENTIFIED_RETENTION_CLICKHOUSE_TESTS === "true"
		? describe
		: describe.skip;
const table = `analytics.retention_test_${crypto.randomUUID().replaceAll("-", "")}`;
type Row = Record<string, string | number | null>;
type Event = {
	timestamp: string;
	profile_id: string;
	event_name?: string;
	owner_id?: string;
	website_id?: string | null;
	namespace?: string | null;
	anonymous_id?: string | null;
};

async function sql(
	query: string,
	params: Record<string, string | number> = {}
) {
	const url = new URL("http://127.0.0.1:16555/");
	url.searchParams.set("output_format_json_quote_64bit_integers", "0");
	url.searchParams.set("join_default_strictness", "ANY");
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(`param_${key}`, String(value));
	}
	const response = await fetch(url, {
		method: "POST",
		body: query,
		signal: AbortSignal.timeout(15_000),
	});
	const body = await response.text();
	if (!response.ok) throw new Error(body);
	return body;
}

async function seed(events: Event[]) {
	const website = `synthetic-${crypto.randomUUID()}`;
	await sql(
		`INSERT INTO ${table} FORMAT JSONEachRow\n${events.map((event) => JSON.stringify({ owner_id: website, website_id: website, event_name: "activated", properties: "{}", ...event })).join("\n")}`
	);
	return website;
}

async function measure(
	website: string,
	options: Partial<QueryRequest> = {},
	selectors: Partial<Record<string, string | number>> = {}
) {
	const filters: Filter[] = Object.entries({
		activation_event: "activated",
		return_event: "returned",
		horizon_days: 7,
		observation_end: "2026-07-31",
		...selectors,
	}).map(([field, value]) => ({ field, op: "eq", value }));
	const query = new SimpleQueryBuilder(
		RetentionBuilders.identified_profile_retention!,
		{
			type: "identified_profile_retention",
			projectId: website,
			from: "2026-07-01",
			to: "2026-07-14",
			filters,
			limit: 100,
			...options,
		}
	).compile();
	const result = await sql(
		`${query.sql.replaceAll("analytics.custom_events", table)} FORMAT JSONEachRow`,
		z.record(z.string(), z.union([z.string(), z.number()])).parse(query.params)
	);
	const rows: Row[] = result
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	expect(rows[0]?.row_type).toBe("overall");
	expect(rows[0]?.cohort_date).toBeNull();
	expect(rows.length).toBeLessThanOrEqual(91);
	return rows;
}

integration("identified retention SQL on synthetic local ClickHouse", () => {
	beforeAll(async () => {
		const ddl = await Bun.file(
			new URL(
				"../../../../db/src/clickhouse/schema/analytics/core/custom_events.sql",
				import.meta.url
			)
		).text();
		await sql(
			`${ddl.slice(0, ddl.indexOf("ENGINE =")).replace("analytics.custom_events", table)} ENGINE = MergeTree ORDER BY (owner_id, event_name, timestamp)`
		);
	});
	afterAll(async () => {
		await sql(`DROP TABLE IF EXISTS ${table}`);
	});

	it("deduplicates activation/return events and counts raw identity coverage separately", async () => {
		const website = await seed([
			{ profile_id: "a", timestamp: "2026-07-01 12:00:00.000" },
			{ profile_id: "a", timestamp: "2026-07-01 12:00:00.000" },
			{ profile_id: "a", timestamp: "2026-07-02 12:00:00.000" },
			{
				profile_id: "a",
				timestamp: "2026-07-08 12:00:00.000",
				event_name: "returned",
			},
			{
				profile_id: "a",
				timestamp: "2026-07-08 12:00:00.000",
				event_name: "returned",
			},
			{ profile_id: "b", timestamp: "2026-07-01 12:00:00.000" },
			{
				profile_id: "b",
				timestamp: "2026-07-01 11:00:00.000",
				event_name: "returned",
			},
			{
				profile_id: "b",
				timestamp: "2026-07-01 12:00:00.000",
				event_name: "returned",
			},
			{
				profile_id: "b",
				timestamp: "2026-07-08 12:00:00.001",
				event_name: "returned",
			},
			{
				profile_id: "",
				anonymous_id: "daily-salted",
				timestamp: "2026-07-01 12:00:00.000",
			},
			{
				profile_id: "",
				anonymous_id: "daily-salted",
				timestamp: "2026-07-01 12:00:00.000",
			},
		]);
		const rows = await measure(website);
		expect(rows[0]).toMatchObject({
			activated_profiles: 2,
			eligible_profiles: 2,
			retained_profiles: 1,
			not_retained_profiles: 1,
			incomplete_profiles: 0,
			retention_rate: 50,
			activation_events: 6,
			identified_activation_events: 4,
			unidentified_activation_events: 2,
			activation_identity_coverage: 66.67,
		});
		expect(rows[1]).toMatchObject({
			cohort_date: "2026-07-01",
			activated_profiles: 2,
		});
		expect(rows[2]).toMatchObject({
			cohort_date: "2026-07-02",
			activated_profiles: 0,
			activation_events: 1,
		});
	});

	it("excludes incomplete follow-up even when a return has already happened", async () => {
		const website = await seed([
			{ profile_id: "last-mature", timestamp: "2026-07-03 23:59:59.999" },
			{
				profile_id: "last-mature",
				timestamp: "2026-07-10 23:59:59.999",
				event_name: "returned",
			},
			{
				profile_id: "endpoint-at-cutoff",
				timestamp: "2026-07-04 00:00:00.000",
			},
			{
				profile_id: "endpoint-at-cutoff",
				timestamp: "2026-07-11 00:00:00.000",
				event_name: "returned",
			},
			{ profile_id: "early-return", timestamp: "2026-07-10 00:00:00.000" },
			{
				profile_id: "early-return",
				timestamp: "2026-07-10 00:00:00.001",
				event_name: "returned",
			},
		]);
		const rows = await measure(
			website,
			{ to: "2026-07-10" },
			{ observation_end: "2026-07-10" }
		);
		expect(rows[0]).toMatchObject({
			activated_profiles: 3,
			eligible_profiles: 1,
			retained_profiles: 1,
			incomplete_profiles: 2,
			not_retained_profiles: 0,
			retention_rate: 100,
			observed_before: "2026-07-11T00:00:00.000Z",
		});
		expect(rows.at(-1)).toMatchObject({
			eligible_profiles: 0,
			retention_rate: null,
		});
	});

	it("does not join cross-tenant, cross-website or anonymous-only identities", async () => {
		const website = await seed([
			{
				profile_id: "collision",
				timestamp: "2026-07-01 00:00:00.000",
				anonymous_id: "same-anon",
			},
			{
				profile_id: "",
				timestamp: "2026-07-02 00:00:00.000",
				anonymous_id: "same-anon",
				event_name: "returned",
			},
			{
				profile_id: "collision",
				timestamp: "2026-07-02 00:00:00.000",
				owner_id: "other-owner",
				website_id: "other-site",
				event_name: "returned",
			},
		]);
		await sql(
			`INSERT INTO ${table} FORMAT JSONEachRow\n${JSON.stringify({ owner_id: "other-owner", website_id: website, profile_id: "collision", event_name: "returned", timestamp: "2026-07-02 00:00:00.000", properties: "{}" })}\n${JSON.stringify({ owner_id: "shared-org", website_id: website, profile_id: "org-profile", event_name: "activated", timestamp: "2026-07-01 00:00:00.000", properties: "{}" })}\n${JSON.stringify({ owner_id: "shared-org", website_id: "other-site", profile_id: "org-profile", event_name: "returned", timestamp: "2026-07-02 00:00:00.000", properties: "{}" })}`
		);
		expect((await measure(website))[0]).toMatchObject({
			activated_profiles: 2,
			retained_profiles: 0,
			not_retained_profiles: 2,
		});
	});

	it("reports anonymous-only and empty populations without fake profile denominators", async () => {
		const website = await seed([
			{
				profile_id: "",
				anonymous_id: "synthetic-anon",
				timestamp: "2026-07-01 00:00:00.000",
			},
		]);
		expect((await measure(website))[0]).toMatchObject({
			activated_profiles: 0,
			eligible_profiles: 0,
			retention_rate: null,
			activation_events: 1,
			unidentified_activation_events: 1,
			activation_identity_coverage: 0,
		});
		const empty = await measure(`empty-${crypto.randomUUID()}`);
		expect(empty).toHaveLength(1);
		expect(empty[0]).toMatchObject({
			activated_profiles: 0,
			activation_events: 0,
			retention_rate: null,
			activation_identity_coverage: null,
			cohort_from: "2026-07-01",
			cohort_to: "2026-07-14",
		});
	});

	it("uses exact names and namespace on both phases", async () => {
		const website = await seed([
			{
				profile_id: "a",
				namespace: "wanted",
				timestamp: "2026-07-01 00:00:00.000",
			},
			{
				profile_id: "a",
				namespace: "wrong",
				timestamp: "2026-07-02 00:00:00.000",
				event_name: "returned",
			},
			{
				profile_id: "a",
				namespace: "wanted",
				timestamp: "2026-07-02 00:00:00.000",
				event_name: "returned-extra",
			},
			{
				profile_id: "b",
				namespace: "wrong",
				timestamp: "2026-07-01 00:00:00.000",
			},
			{
				profile_id: "b",
				namespace: "wanted",
				timestamp: "2026-07-02 00:00:00.000",
				event_name: "returned",
			},
		]);
		expect(
			(await measure(website, {}, { namespace: "wanted" }))[0]
		).toMatchObject({
			activated_profiles: 1,
			retained_profiles: 0,
			activation_events: 1,
		});
	});

	it("uses observed-in-window activation and handles identical event selectors strictly", async () => {
		const website = await seed([
			{ profile_id: "a", timestamp: "2026-06-01 00:00:00.000" },
			{ profile_id: "a", timestamp: "2026-07-01 00:00:00.000" },
			{ profile_id: "a", timestamp: "2026-07-01 00:00:00.000" },
			{ profile_id: "a", timestamp: "2026-07-02 00:00:00.000" },
			{ profile_id: "b", timestamp: "2026-07-01 00:00:00.000" },
			{ profile_id: "b", timestamp: "2026-07-01 00:00:00.000" },
		]);
		expect(
			(await measure(website, {}, { return_event: "activated" }))[0]
		).toMatchObject({
			activated_profiles: 2,
			retained_profiles: 1,
			activation_basis: "first_in_cohort_window",
		});
	});

	it("preserves local calendar bounds and fixed 24-hour horizons across DST", async () => {
		const website = await seed([
			{ profile_id: "before", timestamp: "2026-03-07 04:59:59.999" },
			{ profile_id: "edge", timestamp: "2026-03-07 05:00:00.000" },
			{
				profile_id: "edge",
				timestamp: "2026-03-14 05:00:00.000",
				event_name: "returned",
			},
			{ profile_id: "last", timestamp: "2026-03-09 03:59:59.999" },
			{ profile_id: "after", timestamp: "2026-03-09 04:00:00.000" },
		]);
		const rows = await measure(
			website,
			{ from: "2026-03-07", to: "2026-03-08", timezone: "America/New_York" },
			{ observation_end: "2026-03-31" }
		);
		expect(rows[0]).toMatchObject({
			activated_profiles: 2,
			retained_profiles: 1,
			cohort_start: "2026-03-07T05:00:00.000Z",
			cohort_end: "2026-03-09T04:00:00.000Z",
			observed_before: "2026-04-01T04:00:00.000Z",
		});
		expect(rows.map((row) => row.cohort_date)).toEqual([
			null,
			"2026-03-07",
			"2026-03-08",
		]);
	});

	it("supports the exact 30-day endpoint and separate observation date", async () => {
		const website = await seed([
			{ profile_id: "a", timestamp: "2026-07-01 12:00:00.000" },
			{
				profile_id: "a",
				timestamp: "2026-07-31 12:00:00.000",
				event_name: "returned",
			},
			{ profile_id: "b", timestamp: "2026-07-01 12:00:00.000" },
			{
				profile_id: "b",
				timestamp: "2026-07-31 12:00:00.001",
				event_name: "returned",
			},
		]);
		expect(
			(
				await measure(
					website,
					{ to: "2026-07-01" },
					{ horizon_days: 30, observation_end: "2026-08-01" }
				)
			)[0]
		).toMatchObject({
			activated_profiles: 2,
			eligible_profiles: 2,
			retained_profiles: 1,
			horizon_days: 30,
		});
	});

	it("caps future observation at now and excludes future events", async () => {
		const now = new Date();
		const day = now.toISOString().slice(0, 10);
		const website = await seed([
			{
				profile_id: "recent",
				timestamp: new Date(now.getTime() - 1000)
					.toISOString()
					.replace("T", " ")
					.replace("Z", ""),
			},
			{ profile_id: "future", timestamp: `${day} 23:59:59.999` },
		]);
		const start = new Date(now.getTime() - 86_400_000)
			.toISOString()
			.slice(0, 10);
		const rows = await measure(
			website,
			{ from: start, to: day },
			{ observation_end: "2099-12-31" }
		);
		expect(rows[0]).toMatchObject({
			activated_profiles: 1,
			eligible_profiles: 0,
			retained_profiles: 0,
			not_retained_profiles: 0,
			incomplete_profiles: 1,
		});
	});

	it("returns at most 91 complete rows when limit100 is requested", async () => {
		const events = Array.from({ length: 90 }, (_, index) => ({
			profile_id: `profile-${index}`,
			timestamp: new Date(Date.UTC(2026, 0, 1 + index))
				.toISOString()
				.replace("T", " ")
				.replace("Z", ""),
		}));
		const website = await seed(events);
		const rows = await measure(
			website,
			{ from: "2026-01-01", to: "2026-03-31" },
			{ observation_end: "2026-04-30" }
		);
		expect(rows).toHaveLength(91);
		expect(rows[0]?.activated_profiles).toBe(90);
		expect(rows.at(-1)?.cohort_date).toBe("2026-03-31");
		const limited = await measure(
			website,
			{ from: "2026-01-01", to: "2026-03-31", limit: 1 },
			{ observation_end: "2026-04-30" }
		);
		expect(limited).toHaveLength(1);
		expect(limited[0]?.activated_profiles).toBe(90);
	});
});
