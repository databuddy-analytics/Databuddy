import "@databuddy/test/env";
import { afterAll, describe, expect, it } from "bun:test";
import { clickHouse } from "@databuddy/db/clickhouse";
import {
	deleteAnalytics,
	generateAnalytics,
	seedAnalytics,
} from "@databuddy/db/seed";
import { detectSignals } from "./detection";
import { TRAFFIC_METRICS } from "./investigation";

const describeIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const websiteId = `detection-fixture-${crypto.randomUUID()}`;

describeIntegration("detectSignals on the workspace fixture", () => {
	afterAll(() => deleteAnalytics(clickHouse, websiteId), 30_000);

	it("flags the seeded anomaly", async () => {
		await seedAnalytics(
			clickHouse,
			generateAnalytics({
				anomaly: true,
				clientId: websiteId,
				domain: "localhost",
			})
		);

		const signals = await detectSignals({
			lookbackDays: 7,
			timezone: "UTC",
			websiteId,
		});

		const rising = signals
			.filter((signal) => signal.direction === "up")
			.map((signal) => signal.metric);
		expect(rising.some((metric) => TRAFFIC_METRICS.has(metric))).toBe(true);
		expect(rising).toContain("error_count");
	}, 30_000);
});
