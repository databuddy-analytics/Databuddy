import { randomUUIDv7 } from "bun";
import { describe, expect, test } from "bun:test";
import { clickHouse } from "./client";
import { ARCHIVED_CLIENT_ID_PREFIX, listOwnersWithStoredData } from "./purge";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true"
		? describe
		: describe.skip;

function pageview(clientId: string) {
	return {
		id: crypto.randomUUID(),
		client_id: clientId,
		event_name: "screen_view",
		anonymous_id: "anon_purge_test",
		session_id: "sess_purge_test",
		time: "2026-09-30 00:00:00.342",
		created_at: "2026-09-30 13:00:00.000",
	};
}

describeIntegration("deleted-owner scan", () => {
	test("never lists archived rows as a deleted website", async () => {
		const website = `purge-test-${randomUUIDv7()}`;
		const archived = `${ARCHIVED_CLIENT_ID_PREFIX}googlebot-render:${website}`;
		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.events",
			values: [pageview(website), pageview(archived)],
		});
		try {
			const ids = (await listOwnersWithStoredData()).map((owner) => owner.id);
			expect(ids).toContain(website);
			expect(ids).not.toContain(archived);
		} finally {
			await clickHouse.command({
				query:
					"ALTER TABLE analytics.events DELETE WHERE client_id IN {ids:Array(String)}",
				query_params: { ids: [website, archived] },
				clickhouse_settings: { mutations_sync: "1" },
			});
		}
	});
});
