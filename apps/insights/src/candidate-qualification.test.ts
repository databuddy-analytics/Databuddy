import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { DetectedSignal } from "./detection";
import type { ErrorCohortBehavior } from "./error-cohort-behavior";
import type { ErrorCustomerImpact } from "./error-customer-impact";
import type { ErrorCohortGoalCompletion } from "./error-cohort-goal-completion";
import type { VitalCohortBehavior } from "./vital-cohort-behavior";
import {
	type CandidateQualificationSources,
	qualifyCandidateSignals,
	unqualifiedSignalKeys,
} from "./candidate-qualification";
import { signalKeyForDetectedSignal } from "./investigation";

const baseSignal: DetectedSignal = {
	baseline: 100,
	current: 50,
	deltaPercent: -50,
	detectedAt: "2026-08-01",
	direction: "down",
	label: "Visitors",
	method: "wow",
	metric: "visitors",
	severity: "warning",
};

const errorSignal: DetectedSignal = {
	...baseSignal,
	baseline: 10,
	current: 40,
	deltaPercent: 300,
	direction: "up",
	entityId: "fixture-error",
	entityLabel: "Fixture error",
	label: "Fixture error",
	metric: "error_count",
	subjectKey: "error:fixture-error",
};

const materialImpact: ErrorCustomerImpact = {
	affectedSessions: 30,
	affectedVisitorIdentifiers: 30,
	ambiguousProfileSessions: 0,
	errorOccurrences: 40,
	identifiedProfiles: 0,
	identifiedProfilesWithPriorAttributedCompletedPayment: 0,
	identityCoveragePercent: 0,
	linkedVisitorIdentifiers: 0,
	paymentMatchIsLowerBound: true,
	qualifyingProfilePaymentHistoryObserved: false,
	scope: "fingerprint",
	sessionsWithLaterTelemetry: 0,
	unlinkedVisitorIdentifiers: 30,
};

const observedBehavior: ErrorCohortBehavior = {
	affectedNextPagePercent: 20,
	comparisonNextPagePercent: 40,
	eligibleErrorSessions: 10,
	matchedCoveragePercent: 100,
	matchedErrorSessions: 10,
	matchedPeerSessionObservations: 100,
	matchedStrata: 10,
};

const observedCompletion: ErrorCohortGoalCompletion = {
	affectedCompletionPercent: 10,
	affectedCompletionSessions: 1,
	comparisonCompletionPercent: 40,
	eligibleErrorSessions: 10,
	matchedCoveragePercent: 100,
	matchedErrorSessions: 10,
	matchedPeerSessionObservations: 100,
	matchedStrata: 10,
};

const warningRouteVital: DetectedSignal = {
	...baseSignal,
	baseline: 2_300,
	current: 3_600,
	deltaPercent: 56.5,
	direction: "up",
	entityId: "/explore",
	entityLabel: "Route /explore",
	label: "Largest Contentful Paint on /explore",
	metric: "lcp",
	severity: "warning",
	subjectKey: "route:lcp:/explore",
};

const observedVitalBehavior: VitalCohortBehavior = {
	comparisonNextPagePercent: 55,
	eligibleSlowSessions: 40,
	matchedCoveragePercent: 85,
	matchedPeerSessionObservations: 380,
	matchedSlowSessions: 34,
	matchedStrata: 4,
	metric: "LCP",
	slowNextPagePercent: 20,
};

function sources(
	overrides: Partial<CandidateQualificationSources> = {}
): CandidateQualificationSources {
	return {
		loadErrorCohortBehavior: async () => null,
		loadErrorCohortGoalCompletion: async () => null,
		loadErrorCustomerImpact: async () => null,
		loadVitalCohortBehavior: async () => null,
		...overrides,
	};
}

function qualify(
	signals: DetectedSignal[],
	overrides: Partial<CandidateQualificationSources> = {},
	options: Pick<
		Parameters<typeof qualifyCandidateSignals>[0],
		| "errorQualificationLimit"
		| "prioritizedSignalKeys"
		| "vitalQualificationLimit"
	> = {
		errorQualificationLimit: signals.length,
		vitalQualificationLimit: signals.length,
	}
) {
	return qualifyCandidateSignals({
		errorQualificationLimit: signals.length,
		vitalQualificationLimit: signals.length,
		...options,
		lookbackDays: 7,
		signals,
		sources: sources(overrides),
		timezone: "UTC",
		websiteId: "fixture-site",
	});
}

describe("candidate qualification", () => {
	it("qualifies direct outcomes, verified measurement gaps, and unhealthy regressions", async () => {
		const results = await qualify([
			{ ...baseSignal, metric: "revenue" },
			{ ...baseSignal, metric: "goal:checkout", subjectKey: "goal:checkout" },
			{ ...baseSignal, metric: "funnel:signup", subjectKey: "funnel:signup" },
			{
				...baseSignal,
				metric: "measurement_coverage",
				subjectKey: "measurement:conversion-coverage",
			},
			{
				...baseSignal,
				baseline: 2_000,
				current: 3_000,
				deltaPercent: 50,
				direction: "up",
				metric: "lcp",
			},
		]);

		expect(results.map((result) => result.status)).toEqual([
			"qualified",
			"qualified",
			"qualified",
			"qualified",
			"qualified",
		]);
		expect(results.map((result) => result.reason)).toEqual([
			"direct_business_outcome",
			"direct_business_outcome",
			"direct_business_outcome",
			"measurement_gap",
			"unhealthy_vital",
		]);
	});

	it("qualifies a warning route vital only after a material continuation gap", async () => {
		let vitalBehaviorCalls = 0;
		const results = await qualify([warningRouteVital], {
			loadVitalCohortBehavior: async () => {
				vitalBehaviorCalls += 1;
				return observedVitalBehavior;
			},
		});

		expect(results).toMatchObject([
			{ reason: "observed_vital_session_behavior", status: "qualified" },
		]);
		expect(vitalBehaviorCalls).toBe(1);
	});

	it("screens a cross-metric vital comparison", async () => {
		const results = await qualify([warningRouteVital], {
			loadVitalCohortBehavior: async () => ({
				...observedVitalBehavior,
				metric: "INP",
			}),
		});

		expect(results).toMatchObject([
			{ reason: "warning_vital_without_behavior", status: "screened" },
		]);
	});

	it("screens warning route vitals when behavior is absent, weak, or unavailable", async () => {
		const weakVital: DetectedSignal = {
			...warningRouteVital,
			entityId: "/dashboard",
			entityLabel: "Route /dashboard",
			label: "Largest Contentful Paint on /dashboard",
			subjectKey: "route:lcp:/dashboard",
		};
		const unavailableVital: DetectedSignal = {
			...warningRouteVital,
			entityId: "/pricing",
			entityLabel: "Route /pricing",
			label: "Largest Contentful Paint on /pricing",
			subjectKey: "route:lcp:/pricing",
		};
		const results = await qualify(
			[warningRouteVital, weakVital, unavailableVital],
			{
				loadVitalCohortBehavior: async ({ signal }) => {
					if (signal.signalKey === weakVital.subjectKey) {
						return {
							...observedVitalBehavior,
							comparisonNextPagePercent: 30,
							slowNextPagePercent: 20,
						};
					}
					if (signal.signalKey === unavailableVital.subjectKey) {
						throw new Error("vital comparison unavailable");
					}
					return null;
				},
			}
		);

		expect(results.map((result) => result.status)).toEqual([
			"screened",
			"screened",
			"screened",
		]);
		expect(results.map((result) => result.reason)).toEqual([
			"warning_vital_without_behavior",
			"warning_vital_without_behavior",
			"warning_vital_behavior_unavailable",
		]);
	});

	it("preserves critical and due route vitals without behavior enrichment", async () => {
		const criticalVital: DetectedSignal = {
			...warningRouteVital,
			severity: "critical",
		};
		let vitalBehaviorCalls = 0;
		const results = await qualify(
			[criticalVital, warningRouteVital],
			{
				loadVitalCohortBehavior: async () => {
					vitalBehaviorCalls += 1;
					return null;
				},
			},
			{
				errorQualificationLimit: 0,
				prioritizedSignalKeys: new Set([
					signalKeyForDetectedSignal(warningRouteVital),
				]),
				vitalQualificationLimit: 0,
			}
		);

		expect(results).toMatchObject([
			{ reason: "unhealthy_vital", status: "qualified" },
			{ reason: "unhealthy_vital", status: "qualified" },
		]);
		expect(vitalBehaviorCalls).toBe(0);
	});

	it("bounds fresh warning vital enrichment while preserving a due recheck above the cap", async () => {
		const vitals = [
			warningRouteVital,
			{
				...warningRouteVital,
				entityId: "/dashboard",
				entityLabel: "Route /dashboard",
				label: "Largest Contentful Paint on /dashboard",
				subjectKey: "route:lcp:/dashboard",
			},
			{
				...warningRouteVital,
				entityId: "/pricing",
				entityLabel: "Route /pricing",
				label: "Largest Contentful Paint on /pricing",
				subjectKey: "route:lcp:/pricing",
			},
		];
		const dueVital = vitals[2];
		if (!dueVital) {
			throw new Error("Expected due vital fixture");
		}
		const loadedSignalKeys: string[] = [];
		const results = await qualify(
			vitals,
			{
				loadVitalCohortBehavior: async ({ signal }) => {
					loadedSignalKeys.push(signal.signalKey);
					return observedVitalBehavior;
				},
			},
			{
				errorQualificationLimit: 0,
				prioritizedSignalKeys: new Set([
					signalKeyForDetectedSignal(dueVital),
				]),
				vitalQualificationLimit: 2,
			}
		);

		expect(loadedSignalKeys.sort()).toEqual(
			vitals
				.slice(0, 2)
				.map((signal) => signalKeyForDetectedSignal(signal))
				.sort()
		);
		expect(results).toMatchObject([
			{ reason: "observed_vital_session_behavior", status: "qualified" },
			{ reason: "observed_vital_session_behavior", status: "qualified" },
			{ reason: "unhealthy_vital", status: "qualified" },
		]);
	});

	it("uses configured completion before behavior and material error reach", async () => {
		const results = await qualify([errorSignal], {
			loadErrorCohortBehavior: async () => observedBehavior,
			loadErrorCohortGoalCompletion: async () => observedCompletion,
			loadErrorCustomerImpact: async () => materialImpact,
		});

		expect(results).toMatchObject([
			{ reason: "configured_completion", status: "qualified" },
		]);
	});

	it("screens generic metrics and does not query error enrichments for them", async () => {
		let enrichmentCalls = 0;
		const results = await qualify(
			[
				baseSignal,
				{ ...baseSignal, metric: "bounce_rate" },
				{ ...baseSignal, metric: "session_duration" },
				{
					...baseSignal,
					metric: "custom_event_count",
					subjectKey: "custom_event:signup_completed",
				},
				{
					...baseSignal,
					baseline: 2_000,
					current: 2_500,
					deltaPercent: 25,
					direction: "up",
					metric: "lcp",
				},
			],
			{
				loadErrorCohortBehavior: async () => {
					enrichmentCalls += 1;
					return observedBehavior;
				},
				loadErrorCohortGoalCompletion: async () => {
					enrichmentCalls += 1;
					return observedCompletion;
				},
				loadErrorCustomerImpact: async () => {
					enrichmentCalls += 1;
					return materialImpact;
				},
			}
		);

		expect(results.map((result) => result.status)).toEqual([
			"screened",
			"screened",
			"screened",
			"screened",
			"screened",
		]);
		expect(results.map((result) => result.reason)).toEqual([
			"generic_metric_without_impact",
			"generic_metric_without_impact",
			"generic_metric_without_impact",
			"unknown_event_outcome",
			"generic_metric_without_impact",
		]);
		expect(enrichmentCalls).toBe(0);
	});

	it("keeps weak errors screened when optional aggregate enrichment is unavailable", async () => {
		const results = await qualify([errorSignal], {
			loadErrorCohortBehavior: async () => {
				throw new Error("behavior query unavailable");
			},
			loadErrorCohortGoalCompletion: async () => null,
			loadErrorCustomerImpact: async () => ({
				...materialImpact,
				affectedVisitorIdentifiers: 29,
				unlinkedVisitorIdentifiers: 29,
			}),
		});

		expect(results).toMatchObject([
			{ reason: "low_reach_error_without_harm", status: "screened" },
		]);
		expect(unqualifiedSignalKeys(results)).toEqual(
			new Set([signalKeyForDetectedSignal(errorSignal)])
		);
	});

	it("bounds exact-error enrichment while preserving a prioritized recheck", async () => {
		const errors = Array.from({ length: 8 }, (_, index) => ({
			...errorSignal,
			entityId: `fixture-error-${index + 1}`,
			entityLabel: `Fixture error ${index + 1}`,
			label: `Fixture error ${index + 1}`,
			subjectKey: `error:fixture-error-${index + 1}`,
		}));
		const prioritized = errors[7];
		if (!prioritized) {
			throw new Error("Expected prioritized fixture error");
		}
		let enrichmentCalls = 0;
		const results = await qualify(
			errors,
			{
				loadErrorCohortBehavior: async () => {
					enrichmentCalls += 1;
					return null;
				},
				loadErrorCohortGoalCompletion: async () => {
					enrichmentCalls += 1;
					return null;
				},
				loadErrorCustomerImpact: async () => {
					enrichmentCalls += 1;
					return materialImpact;
				},
			},
			{
				errorQualificationLimit: 2,
				prioritizedSignalKeys: new Set([
					signalKeyForDetectedSignal(prioritized),
				]),
			}
		);

		expect(enrichmentCalls).toBe(6);
		expect(results.filter((result) => result.status === "qualified")).toHaveLength(
			2
		);
		expect(
			results.find(
				(result) =>
					signalKeyForDetectedSignal(result.signal) ===
					signalKeyForDetectedSignal(prioritized)
			)
		).toMatchObject({ reason: "material_error_reach", status: "qualified" });
		expect(
			results.filter(
				(result) =>
					result.reason === "error_outside_qualification_budget"
			)
		).toHaveLength(6);
	});
});
