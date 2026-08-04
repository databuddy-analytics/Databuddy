import { randomUUIDv7 } from "bun";
import { describe, expect, it } from "bun:test";

const TEST_CLICKHOUSE_URL = "http://default:@127.0.0.1:8123";
const isClickHouseUp = await fetch("http://127.0.0.1:8123/?query=SELECT+1", {
	signal: AbortSignal.timeout(1500),
})
	.then((response) => response.ok)
	.catch(() => false);
const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" && isClickHouseUp
		? describe
		: describe.skip;

// This fixture is intentionally pinned to localhost before loading the client.
// It never writes to an environment from a developer's .env.
process.env.CLICKHOUSE_URL = TEST_CLICKHOUSE_URL;
const { clickHouse } = await import("@databuddy/db/clickhouse");
const { executeInsightsVitalCohortBehaviorQuery } = await import(".");

function pageEvent(params: {
	path: string;
	sessionId: string;
	time: string;
	websiteId: string;
}) {
	return {
		anonymous_id: `anon-${params.sessionId}`,
		client_id: params.websiteId,
		created_at: params.time,
		event_name: "screen_view",
		id: randomUUIDv7(),
		ip: "127.0.0.1",
		path: params.path,
		properties: "{}",
		session_id: params.sessionId,
		time: params.time,
		url: `https://fixture.test${params.path}`,
		user_agent: "integration-fixture",
	};
}

function vitalSpan(params: {
	metricValue: number;
	path: string;
	sessionId: string;
	websiteId: string;
}) {
	return {
		anonymous_id: `anon-${params.sessionId}`,
		client_id: params.websiteId,
		metric_name: "LCP",
		metric_value: params.metricValue,
		path: params.path,
		session_id: params.sessionId,
		timestamp: "2026-08-01 10:01:00",
	};
}

describeIntegration("route-vital continuation against ClickHouse", () => {
	it("returns only a same-route/day aggregate and excludes controls with another slow sample", async () => {
		const websiteId = `vital-cohort-${randomUUIDv7()}`;
		const events = [];
		const vitals = [];

		for (let index = 0; index < 10; index += 1) {
			const sessionId = `slow-session-${index}`;
			events.push(
				pageEvent({
					path: "/origin",
					sessionId,
					time: "2026-08-01 10:00:00",
					websiteId,
				})
			);
			if (index === 0) {
				events.push(
					pageEvent({
						path: "/next",
						sessionId,
						time: "2026-08-01 10:10:00",
						websiteId,
					})
				);
			}
			vitals.push(
				vitalSpan({
					metricValue: 3000,
					path: "/origin",
					sessionId,
					websiteId,
				})
			);

			const controlSessionId = `control-session-${index}`;
			events.push(
				pageEvent({
					path: "/origin",
					sessionId: controlSessionId,
					time: "2026-08-01 10:00:00",
					websiteId,
				})
			);
			if (index < 8) {
				events.push(
					pageEvent({
						path: "/next",
						sessionId: controlSessionId,
						time: "2026-08-01 10:10:00",
						websiteId,
					})
				);
			}
			vitals.push(
				vitalSpan({
					metricValue: 1200,
					path: "/origin",
					sessionId: controlSessionId,
					websiteId,
				})
			);
		}

		const excludedControlSessionId = "control-with-slow-other-route";
		events.push(
			pageEvent({
				path: "/origin",
				sessionId: excludedControlSessionId,
				time: "2026-08-01 10:00:00",
				websiteId,
			})
		);
		vitals.push(
			vitalSpan({
				metricValue: 1200,
				path: "/origin",
				sessionId: excludedControlSessionId,
				websiteId,
			}),
			vitalSpan({
				metricValue: 3000,
				path: "/another-route",
				sessionId: excludedControlSessionId,
				websiteId,
			})
		);

		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.events",
			values: events,
		});
		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.web_vitals_spans",
			values: vitals,
		});

		const rows = await executeInsightsVitalCohortBehaviorQuery({
			from: "2026-08-01",
			path: "/origin",
			projectId: websiteId,
			to: "2026-08-01",
			timezone: "UTC",
			vitalMetric: "LCP",
			vitalThreshold: 2500,
		});

		expect(rows).toEqual([
			{
				comparison_next_page_percent: 80,
				eligible_slow_sessions: 10,
				matched_coverage_percent: 100,
				matched_peer_session_observations: 10,
				matched_slow_sessions: 10,
				matched_strata: 1,
				slow_next_page_percent: 10,
			},
		]);
	});
});
