import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { randomUUIDv7 } from "bun";
import { chCommand, chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { SimpleQueryBuilder } from "../simple-builder";
import type { CompiledQuery } from "../types";
import { ProfilesBuilders } from "./profiles";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

if (process.env.CLICKHOUSE_INTEGRATION_TESTS === "true") {
	setDefaultTimeout(15_000);
}

const websiteId = `profile-builder-${randomUUIDv7()}`;
const profileId = "profile-builder-user";
const anonymousId = "profile-builder-anonymous";
const collisionWebsiteId = `profile-builder-collision-${randomUUIDv7()}`;
const collisionProfileA = "profile-builder-collision-a";
const collisionProfileB = "profile-builder-collision-b";
const collisionSessionId = "profile-builder-collision-session";
type ProfileSessionEvent = [
	string,
	string,
	string,
	string,
	string | null,
	string?,
];

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
						events: ProfileSessionEvent[];
						session_id: string;
					}>(
						query.sql,
						query.params
					)
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
});
