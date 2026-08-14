import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUIDv7 } from "bun";
import { chCommand, chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { ProfilesBuilders } from "./profiles";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const websiteId = `profile-builder-${randomUUIDv7()}`;
const profileId = "profile-builder-user";
const anonymousId = "profile-builder-anonymous";

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
	});

	it("stitches pre-identification events and returns one profile row", async () => {
		const query = ProfilesBuilders.profile_list?.customSql?.({
			endDate: "2026-08-02",
			limit: 10,
			offset: 0,
			startDate: "2026-08-01",
			websiteId,
		});
		if (!query || typeof query === "string") {
			throw new Error("Profile list did not compile");
		}

		const rows = await chQuery<{
			custom_event_count: number | string;
			profile_id: string;
			session_count: number | string;
			total_events: number | string;
			visitor_id: string;
		}>(query.sql, query.params);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			profile_id: profileId,
			visitor_id: profileId,
		});
		expect(Number(rows[0]?.total_events)).toBe(3);
		expect(Number(rows[0]?.session_count)).toBe(2);
		expect(Number(rows[0]?.custom_event_count)).toBe(1);
	});

	it("uses the same stitched identity in profile detail and sessions", async () => {
		const detailQuery = ProfilesBuilders.profile_detail?.customSql?.({
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
			startDate: "2026-08-01",
			websiteId,
		});
		const sessionsQuery = ProfilesBuilders.profile_sessions?.customSql?.({
			endDate: "2026-08-02",
			filters: [{ field: "anonymous_id", op: "eq", value: profileId }],
			startDate: "2026-08-01",
			websiteId,
		});
		if (
			!detailQuery ||
			typeof detailQuery === "string" ||
			!sessionsQuery ||
			typeof sessionsQuery === "string"
		) {
			throw new Error("Profile detail queries did not compile");
		}

		const [detailRows, sessionRows] = await Promise.all([
			chQuery<{ total_pageviews: number | string }>(
				detailQuery.sql,
				detailQuery.params
			),
			chQuery<{ session_id: string }>(sessionsQuery.sql, sessionsQuery.params),
		]);

		expect(Number(detailRows[0]?.total_pageviews)).toBe(3);
		expect(sessionRows).toHaveLength(2);
		expect(new Set(sessionRows.map((row) => row.session_id))).toEqual(
			new Set([
				"profile-builder-session-1",
				"profile-builder-session-2",
			])
		);
	});
});
