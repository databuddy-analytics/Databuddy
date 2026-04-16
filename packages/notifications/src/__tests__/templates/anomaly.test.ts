import { describe, expect, test } from "bun:test";
import {
	type AnomalyNotificationInput,
	buildAnomalyNotificationPayload,
} from "../../templates/anomaly";

function makeInput(
	overrides: Partial<AnomalyNotificationInput> = {}
): AnomalyNotificationInput {
	return {
		kind: "spike",
		metric: "pageviews",
		siteLabel: "Acme Corp",
		currentValue: 5000,
		baselineValue: 1000,
		percentChange: 400,
		zScore: 4.5,
		severity: "critical",
		periodStart: "2026-04-03T00:00:00Z",
		periodEnd: "2026-04-03T01:00:00Z",
		...overrides,
	};
}

describe("buildAnomalyNotificationPayload", () => {
	describe("title and priority", () => {
		test("spike critical — title starts with up arrow, priority urgent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ kind: "spike", severity: "critical" })
			);
			expect(result.title).toStartWith("↑");
			expect(result.title).toContain("Critical");
			expect(result.priority).toBe("urgent");
		});

		test("drop warning — title starts with down arrow, priority high", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ kind: "drop", severity: "warning", percentChange: -50 })
			);
			expect(result.title).toStartWith("↓");
			expect(result.title).toContain("Warning");
			expect(result.priority).toBe("high");
		});
	});

	describe("metric labels in title", () => {
		test("pageviews renders as Pageviews", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "pageviews" })
			);
			expect(result.title).toContain("Pageviews");
		});

		test("errors renders as Errors", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "errors" })
			);
			expect(result.title).toContain("Errors");
		});

		test("custom_events renders as Custom Events", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "custom_events" })
			);
			expect(result.title).toContain("Custom Events");
		});

		test("unknown metric renders raw string", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "api_calls" })
			);
			expect(result.title).toContain("api_calls");
		});

		test("eventName overrides metric label", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: "checkout" })
			);
			expect(result.title).toContain("checkout (custom event)");
		});
	});

	describe("message content", () => {
		test("includes percentage and values", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.message).toContain("400.0%");
			expect(result.message).toContain("5K");
			expect(result.message).toContain("1K");
		});

		test("includes z-score", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ zScore: 4.5 })
			);
			expect(result.message).toContain("4.50");
		});

		test("includes period range", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.message).toContain("2026-04-03T00:00:00Z");
			expect(result.message).toContain("2026-04-03T01:00:00Z");
		});

		test("includes dashboard URL when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: "https://app.acme.com/dashboard" })
			);
			expect(result.message).toContain(
				"View details: https://app.acme.com/dashboard"
			);
		});

		test("omits dashboard URL when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: undefined })
			);
			expect(result.message).not.toContain("View details:");
		});
	});

	describe("metadata", () => {
		test("contains all required keys", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.metadata).toMatchObject({
				template: "anomaly",
				kind: "spike",
				metric: "pageviews",
				siteLabel: "Acme Corp",
				severity: "critical",
				currentValue: 5000,
				baselineValue: 1000,
				percentChange: 400,
				zScore: 4.5,
				periodStart: "2026-04-03T00:00:00Z",
				periodEnd: "2026-04-03T01:00:00Z",
			});
		});

		test("includes eventName when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: "checkout" })
			);
			expect(result.metadata?.eventName).toBe("checkout");
		});

		test("excludes eventName when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: undefined })
			);
			expect(result.metadata).not.toHaveProperty("eventName");
		});

		test("includes dashboardUrl when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: "https://app.acme.com" })
			);
			expect(result.metadata?.dashboardUrl).toBe("https://app.acme.com");
		});

		test("excludes dashboardUrl when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: undefined })
			);
			expect(result.metadata).not.toHaveProperty("dashboardUrl");
		});
	});
});
