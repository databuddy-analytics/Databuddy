import { describe, expect, it } from "bun:test";
import dayjs from "dayjs";
import type { DetectSignalsParams } from "./detection";
import {
	detectMeasurementRecommendationSignals,
	type MeasurementRecommendationDeps,
} from "./measurement-recommendation-detection";

const TODAY = dayjs("2026-08-01");

const PARAMS: DetectSignalsParams = {
	lookbackDays: 7,
	timezone: "UTC",
	websiteId: "test-site",
};

function makeDeps(
	overrides: Partial<MeasurementRecommendationDeps> = {}
): MeasurementRecommendationDeps {
	return {
		fetchDefinitionCounts: async () => ({ activeFunnels: 0, activeGoals: 0 }),
		fetchTelemetry: async () => ({
			customEventNames: [],
			pageviews: 60,
			routes: ["/explore"],
			sessions: 40,
		}),
		...overrides,
	};
}

describe("detectMeasurementRecommendationSignals", () => {
	it("emits one sanitized navigation-coverage signal without definitions or custom events", async () => {
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: [],
					pageviews: 72,
					routes: ["https://example.com/signup?email=ari@example.com&token=abc123"],
					sessions: 48,
				}),
			})
		);

		expect(signals).toHaveLength(1);
		expect(signals[0]).toMatchObject({
			current: 0,
			metric: "measurement_coverage",
			measurementCandidate: {
				basis: "observed_navigation_proxy",
				kind: "page_navigation_proxy",
				target: "/signup",
				type: "PAGE_VIEW",
			},
			severity: "info",
			subjectKey: "measurement:conversion-coverage",
		});
		expect(signals[0]?.definitionEvidence).toContain("navigation proxy");
		expect(JSON.stringify(signals[0])).not.toContain("ari@example.com");
		expect(JSON.stringify(signals[0])).not.toContain("abc123");
	});

	it("uses an observed canonical conversion event as a bounded goal candidate", async () => {
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: ["signup_completed", "button_click"],
					pageviews: 60,
					routes: [],
					sessions: 40,
				}),
			})
		);

		expect(signal?.measurementCandidate).toEqual({
			basis: "observed_custom_event",
			kind: "event_goal_candidate",
			target: "signup_completed",
			type: "EVENT",
		});
		expect(signal?.definitionEvidence).toContain("not that the event is a business conversion");
	});

	it("withholds dynamic route and event identifiers from candidates", async () => {
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: ["purchase_ari"],
					pageviews: 60,
					routes: ["/checkout/ari?token=private"],
					sessions: 40,
				}),
			})
		);

		expect(signal?.measurementCandidate).toBeUndefined();
		expect(JSON.stringify(signal)).not.toContain("ari");
		expect(JSON.stringify(signal)).not.toContain("private");
	});

	it("suppresses the signal when usable measurement definitions already exist", async () => {
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionCounts: async () => ({
					activeFunnels: 0,
					activeGoals: 1,
				}),
			})
		);

		expect(signals).toEqual([]);
	});

	it("suppresses the signal for insufficient current activity", async () => {
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: [],
					pageviews: 29,
					routes: ["/signup"],
					sessions: 29,
				}),
			})
		);

		expect(signals).toEqual([]);
	});

	it("does not hide telemetry failures", async () => {
		await expect(
			detectMeasurementRecommendationSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchTelemetry: async () => {
						throw new Error("telemetry unavailable");
					},
				})
			)
		).rejects.toThrow("telemetry unavailable");
	});
});
