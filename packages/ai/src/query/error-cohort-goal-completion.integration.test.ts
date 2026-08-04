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
const { executeInsightsErrorCohortGoalCompletionQuery } = await import(".");

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

function errorSpan(params: { sessionId: string; websiteId: string }) {
	return {
		anonymous_id: `anon-${params.sessionId}`,
		client_id: params.websiteId,
		error_type: "Error",
		message: "configured-goal-fixture-error",
		path: "/origin",
		session_id: params.sessionId,
		timestamp: "2026-08-01 10:05:00",
	};
}

describeIntegration("post-error configured-goal completion against ClickHouse", () => {
	it("returns a route/day-matched same-session aggregate without emitting target or identifiers", async () => {
		const websiteId = `goal-completion-${randomUUIDv7()}`;
		const events = [];
		const errors = [];

		for (let index = 0; index < 10; index += 1) {
			const errorSession = `error-session-${index}`;
			events.push(
				pageEvent({
					path: "/origin",
					sessionId: errorSession,
					time: "2026-08-01 10:00:00",
					websiteId,
				})
			);
			if (index === 0) {
				events.push(
					pageEvent({
						path: "/completed",
						sessionId: errorSession,
						time: "2026-08-01 10:10:00",
						websiteId,
					})
				);
			}
			errors.push(errorSpan({ sessionId: errorSession, websiteId }));

			const controlSession = `control-session-${index}`;
			events.push(
				pageEvent({
					path: "/origin",
					sessionId: controlSession,
					time: "2026-08-01 10:00:00",
					websiteId,
				})
			);
			if (index < 8) {
				events.push(
					pageEvent({
						path: "/completed",
						sessionId: controlSession,
						time: "2026-08-01 10:10:00",
						websiteId,
					})
				);
			}
		}

		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.events",
			values: events,
		});
		await clickHouse.insert({
			format: "JSONEachRow",
			table: "analytics.error_spans",
			values: errors,
		});

		const rows = await executeInsightsErrorCohortGoalCompletionQuery({
			errorSelector: {
				field: "message",
				value: "configured-goal-fixture-error",
			},
			from: "2026-08-01",
			goalTarget: "/completed",
			goalType: "PAGE_VIEW",
			projectId: websiteId,
			to: "2026-08-01",
			timezone: "UTC",
		});

		expect(rows).toEqual([
			{
				affected_completion_percent: 10,
				affected_completion_sessions: 1,
				comparison_completion_percent: 80,
				eligible_error_sessions: 10,
				matched_coverage_percent: 100,
				matched_error_sessions: 10,
				matched_peer_session_observations: 10,
				matched_strata: 1,
			},
		]);
	});
});
