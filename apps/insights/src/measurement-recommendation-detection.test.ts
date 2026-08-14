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
		fetchDefinitionCoverage: async () => ({
			activeFunnels: 0,
			activeGoals: 0,
			coveredEventTargets: [],
		}),
		fetchObservedEvents: async () => [],
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

	it("rejects double-slash route candidates", async () => {
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: [],
					pageviews: 60,
					routes: ["//signup", "https://example.com//checkout"],
					sessions: 40,
				}),
			})
		);

		expect(signal?.measurementCandidate).toBeUndefined();
	});

	it("labels no-candidate evidence as sampled when custom event discovery hits its cap", async () => {
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async () => ({
					customEventNames: ["button_click", "screen_view"],
					customEventSampleLimit: 1000,
					customEventSampled: true,
					pageviews: 60,
					routes: [],
					sessions: 40,
				}),
			})
		);

		expect(signal?.measurementCandidate).toBeUndefined();
		expect(signal?.definitionEvidence).toContain(
			"top 1000 custom event types"
		);
	});

	it("finds a high-reach uncovered event even when other definitions exist", async () => {
		let telemetryCalls = 0;
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionCoverage: async () => ({
					activeFunnels: 0,
					activeGoals: 1,
					coveredEventTargets: ["demo_requested"],
				}),
				fetchObservedEvents: async () => [
					{ name: "signup_completed", uniqueUsers: 30 },
				],
				fetchTelemetry: async () => {
					telemetryCalls += 1;
					throw new Error("telemetry should not be fetched");
				},
			})
		);

		expect(signal).toMatchObject({
			label: "High-reach conversion event is not measured",
			measurementCandidate: {
				basis: "observed_custom_event",
				kind: "event_goal_candidate",
				target: "signup_completed",
				type: "EVENT",
			},
			subjectKey: "measurement:uncovered-event:signup_completed",
		});
		expect(signal?.definitionEvidence).toContain("30 visitor identifiers");
		expect(telemetryCalls).toBe(0);
	});

	it("does not repeat event coverage already represented by a definition", async () => {
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionCoverage: async () => ({
					activeFunnels: 1,
					activeGoals: 1,
					coveredEventTargets: ["signup_completed"],
				}),
				fetchObservedEvents: async () => [
					{ name: "signup_completed", uniqueUsers: 400 },
				],
			})
		);

		expect(signals).toEqual([]);
	});

	it("requires safe, conversion-like event coverage at meaningful reach", async () => {
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionCoverage: async () => ({
					activeFunnels: 1,
					activeGoals: 0,
					coveredEventTargets: [],
				}),
				fetchObservedEvents: async () => [
					{ name: "signup_completed", uniqueUsers: 29 },
					{ name: "button_clicked", uniqueUsers: 300 },
					{ name: "signup_ari", uniqueUsers: 300 },
				],
			})
		);

		expect(signals).toEqual([]);
	});

	it("selects the highest-reach uncovered event deterministically", async () => {
		const [signal] = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchDefinitionCoverage: async () => ({
					activeFunnels: 1,
					activeGoals: 0,
					coveredEventTargets: [],
				}),
				fetchObservedEvents: async () => [
					{ name: "purchase_completed", uniqueUsers: 44 },
					{ name: "demo_requested", uniqueUsers: 44 },
					{ name: "signup_completed", uniqueUsers: 43 },
				],
			})
		);

		expect(signal?.measurementCandidate).toMatchObject({
			target: "demo_requested",
		});
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

	it("recommends checking tracking only after sixty days with no telemetry", async () => {
		const ranges: Array<{ from: string; to: string }> = [];
		const noTelemetry = {
			customEventNames: [],
			pageviews: 0,
			routes: [],
			sessions: 0,
		};
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async (range) => {
					ranges.push(range);
					return noTelemetry;
				},
			})
		);

		expect(signals).toMatchObject([
			{
				metric: "measurement_coverage",
				setupRecommendationCandidate: {
					feature: "tracking",
					kind: "databuddy_setup",
				},
				subjectKey: "measurement:tracking-activity",
			},
		]);
		expect(ranges).toContainEqual({ from: "2026-06-02", to: "2026-07-31" });

		const activeCustomEvents = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchTelemetry: async (range) =>
					range.from === "2026-06-02"
						? { ...noTelemetry, customEventNames: ["screen_view"] }
						: noTelemetry,
			})
		);
		expect(activeCustomEvents).toEqual([]);
	});

	it("uses activity-only reads for long-term tracking checks", async () => {
		const telemetryRanges: Array<{ from: string; to: string }> = [];
		const activityRanges: Array<{ from: string; to: string }> = [];
		const noTelemetry = {
			customEventNames: [],
			pageviews: 0,
			routes: [],
			sessions: 0,
		};
		const signals = await detectMeasurementRecommendationSignals(
			PARAMS,
			TODAY,
			makeDeps({
				fetchActivity: async (range) => {
					activityRanges.push(range);
					return { customEvents: 0, pageviews: 0, sessions: 0 };
				},
				fetchTelemetry: async (range) => {
					telemetryRanges.push(range);
					return noTelemetry;
				},
			})
		);

		expect(signals[0]?.subjectKey).toBe("measurement:tracking-activity");
		expect(telemetryRanges).toEqual([
			{ from: "2026-07-25", to: "2026-07-31" },
		]);
		expect(activityRanges).toEqual([
			{ from: "2026-06-02", to: "2026-07-31" },
		]);
	});

	it("never recommends tracker repair for a site younger than the activity lookback", async () => {
		const noTelemetry = {
			customEventNames: [],
			pageviews: 0,
			routes: [],
			sessions: 0,
		};
		for (const activeDefinitions of [0, 1]) {
			const signals = await detectMeasurementRecommendationSignals(
				PARAMS,
				TODAY,
				makeDeps({
					fetchActivity: async () => {
						throw new Error("recent sites do not need a long-term activity read");
					},
					fetchDefinitionCoverage: async () => ({
						activeFunnels: activeDefinitions,
						activeGoals: 0,
						coveredEventTargets: [],
						websiteCreatedAt: TODAY.subtract(59, "day").toDate(),
					}),
					fetchTelemetry: async () => noTelemetry,
				})
			);

			expect(signals).toEqual([]);
		}
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
