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
});
