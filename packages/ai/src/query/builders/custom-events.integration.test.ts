import { randomUUIDv7 } from "bun";
import { describe, expect, it } from "bun:test";
import { chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { SimpleQueryBuilder } from "../simple-builder";
import { CustomEventsBuilders } from "./custom-events";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

describeIntegration("custom event identity against ClickHouse", () => {
	it("excludes unidentified rows while deduplicating anonymous and profile identities", async () => {
		const websiteId = `custom-event-identity-${randomUUIDv7()}`;
		const timestamp = "2026-08-02 12:00:00";
		const row = (
			eventName: string,
			anonymousId: string | null,
			profileId = ""
		) => ({
			anonymous_id: anonymousId,
			event_name: eventName,
			namespace: null,
			owner_id: websiteId,
			path: null,
			profile_id: profileId,
			properties: "{}",
			session_id: null,
			source: "integration-test",
			timestamp,
			website_id: websiteId,
		});

		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: [
				row("unidentified", null),
				row("unidentified", null),
				row("anonymous", "anon-1"),
				row("anonymous", "anon-1"),
				row("profile", "anon-2", "profile-1"),
				row("profile", "anon-3", "profile-1"),
			],
		});

		const query = CustomEventsBuilders.custom_events?.customSql?.({
			endDate: "2026-08-03",
			startDate: "2026-08-01",
			websiteId,
		});
		if (!query || typeof query === "string") {
			throw new Error("custom_events did not compile");
		}

		const rows = await chQuery<{
			name: string;
			total_events: number | string;
			unique_users: number | string;
		}>(query.sql, query.params);
		const byName = new Map(rows.map((result) => [result.name, result]));

		expect(Number(byName.get("unidentified")?.total_events)).toBe(2);
		expect(Number(byName.get("unidentified")?.unique_users)).toBe(0);
		expect(Number(byName.get("anonymous")?.unique_users)).toBe(1);
		expect(Number(byName.get("profile")?.unique_users)).toBe(1);
	});

	it("buckets per-event trends by local hour when asked", async () => {
		const websiteId = `custom-event-hourly-${randomUUIDv7()}`;
		const event = (timestamp: string) => ({
			anonymous_id: "anon-1",
			event_name: "signup_completed",
			namespace: null,
			owner_id: websiteId,
			path: null,
			profile_id: "",
			properties: "{}",
			session_id: null,
			source: "integration-test",
			timestamp,
			website_id: websiteId,
		});
		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: [
				event("2026-08-02 08:05:00"),
				event("2026-08-02 08:55:00"),
				event("2026-08-02 13:30:00"),
			],
		});
		const read = async (timeUnit?: "hour") => {
			const { sql, params } = new SimpleQueryBuilder(
				CustomEventsBuilders.custom_events_trends_by_event,
				{
					from: "2026-08-02",
					projectId: websiteId,
					timezone: "Europe/Berlin",
					to: "2026-08-02",
					type: "custom_events_trends_by_event",
					...(timeUnit ? { timeUnit } : {}),
				}
			).compile();
			const rows = await chQuery<{
				date: string;
				total_events: number | string;
			}>(sql, params);
			return rows.map((row) => [String(row.date), Number(row.total_events)]);
		};

		expect(await read("hour")).toEqual([
			["2026-08-02 10:00:00", 2],
			["2026-08-02 15:00:00", 1],
		]);
		expect(await read()).toEqual([["2026-08-02", 3]]);
	});

	it("counts event sessions per browser, version, OS, device and country", async () => {
		const websiteId = `custom-event-segments-${randomUUIDv7()}`;
		const time = "2026-08-02 12:00:00";
		const session = (sessionId: string, context: Record<string, unknown>) => ({
			anonymous_id: `anon-${sessionId}`,
			client_id: websiteId,
			created_at: time,
			event_name: "screen_view",
			id: randomUUIDv7(),
			ip: "127.0.0.1",
			path: "/",
			properties: "{}",
			session_id: sessionId,
			time,
			url: "https://example.com/",
			user_agent: "integration-test",
			...context,
		});
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: [
				session("s-safari", {
					browser_name: "Safari",
					browser_version: "18.4.1",
					country: "US",
					device_type: "mobile",
					os_name: "iOS",
				}),
				session("s-chrome", {
					browser_name: "Chrome",
					browser_version: "141.0.1",
					country: "DE",
					device_type: "",
					os_name: "Windows",
				}),
			],
		});
		const event = (sessionId: string | null) => ({
			anonymous_id: "anon",
			event_name: "checkout_completed",
			namespace: null,
			owner_id: websiteId,
			path: null,
			profile_id: "",
			properties: "{}",
			session_id: sessionId,
			source: "integration-test",
			timestamp: time,
			website_id: websiteId,
		});
		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: [
				event("s-safari"),
				event("s-safari"),
				event("s-chrome"),
				event(null),
			],
		});
		const { sql, params } = new SimpleQueryBuilder(
			CustomEventsBuilders.custom_event_segments,
			{
				filters: [
					{ field: "event_name", op: "eq", value: "checkout_completed" },
				],
				from: "2026-08-02",
				projectId: websiteId,
				timezone: "UTC",
				to: "2026-08-02",
				type: "custom_event_segments",
			}
		).compile();
		const rows = await chQuery<{
			dimension: string;
			events: number | string;
			sessions: number | string;
			value: string;
		}>(sql, params);

		expect(
			Object.fromEntries(
				rows.map((row) => [
					`${row.dimension}:${row.value}`,
					[Number(row.events), Number(row.sessions)],
				])
			)
		).toEqual({
			"browser:Chrome": [1, 1],
			"browser:Safari": [2, 1],
			"browser_version:Chrome 141": [1, 1],
			"browser_version:Safari 18": [2, 1],
			"country:DE": [1, 1],
			"country:US": [2, 1],
			"device:Desktop": [1, 1],
			"device:Mobile": [2, 1],
			"os:Windows": [1, 1],
			"os:iOS": [2, 1],
		});
	});
});
