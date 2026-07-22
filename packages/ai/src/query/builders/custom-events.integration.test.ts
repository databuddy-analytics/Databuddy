import { randomUUIDv7 } from "bun";
import { describe, expect, it } from "bun:test";
import { chQuery, clickHouse } from "@databuddy/db/clickhouse";
import { CustomEventsBuilders } from "./custom-events";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

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
});
