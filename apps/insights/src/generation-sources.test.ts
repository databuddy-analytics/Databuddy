import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import {
	InsightAgentGenerationError,
	InsightAgentTimeoutError,
} from "./agent";
import type { DetectedSignal } from "./detection";
import { errorCohortBehaviorEvidence } from "./error-cohort-behavior";
import {
	errorCustomerImpactEvidence,
	type ErrorCustomerImpact,
} from "./error-customer-impact";
import {
	type InvestigationSources,
	inspectWebsitePortfolioWithSources,
	investigateWebsitePortfolioWithSources,
	resolveInvestigationAsOf,
} from "./generation";
import { prepareInvestigation } from "./investigation";

const trafficDrop: DetectedSignal = {
	baseline: 1000,
	current: 300,
	deltaPercent: -70,
	detectedAt: "2026-07-11",
	direction: "down",
	label: "Visitors",
	method: "wow",
	metric: "visitors",
	severity: "critical",
};

const revenueIncrease: DetectedSignal = {
	...trafficDrop,
	baseline: 100,
	current: 140,
	deltaPercent: 40,
	direction: "up",
	label: "Revenue",
	metric: "revenue",
	severity: "info",
};

const measurementCoverage: DetectedSignal = {
	baseline: 0,
	current: 0,
	deltaPercent: 0,
	detectedAt: "2026-07-11",
	direction: "up",
	label: "Conversion measurement coverage is missing",
	measurementCandidate: {
		basis: "observed_custom_event",
		kind: "event_goal_candidate",
		target: "signup_completed",
		type: "EVENT",
	},
	method: "wow",
	metric: "measurement_coverage",
	severity: "info",
	subjectKey: "measurement:conversion-coverage",
};

const materialErrorImpact = {
	affectedSessions: 30,
	affectedVisitorIdentifiers: 30,
	ambiguousProfileSessions: 0,
	errorOccurrences: 40,
	identifiedProfiles: 0,
	identifiedProfilesWithPriorAttributedCompletedPayment: 0,
	identityCoveragePercent: 0,
	linkedVisitorIdentifiers: 0,
	paymentMatchIsLowerBound: true as const,
	qualifyingProfilePaymentHistoryObserved: false,
	scope: "fingerprint" as const,
	sessionsWithLaterTelemetry: 0,
	unlinkedVisitorIdentifiers: 30,
};

const emptyUsage = {
	inputTokenDetails: {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		noCacheTokens: 0,
	},
	inputTokens: 0,
	outputTokenDetails: { reasoningTokens: 0, textTokens: 0 },
	outputTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
};

const fixtureInput: Parameters<
	typeof investigateWebsitePortfolioWithSources
>[0] = {
	asOf: "2026-07-12",
	domain: "example.com",
	organizationId: "fixture-org",
	timezone: "UTC",
	websiteId: "fixture-site",
};

function fixtureSources(
	overrides: Partial<InvestigationSources>
): InvestigationSources {
	const unexpected = async () => {
		throw new Error("Unexpected investigation source");
	};
	return {
		detectDefinitionSignals: unexpected,
		detectMeasurementRecommendationSignals: async () => [],
		detectMetricSignals: unexpected,
		detectRouteHealthSignals: async () => [],
		fetchAnnotations: unexpected,
		investigateSignal: unexpected,
		loadDueInvestigation: unexpected,
		loadErrorCandidateOverlap: async () => null,
		loadErrorCohortBehavior: async () => null,
		loadErrorCustomerImpact: async ({ signal }) =>
			(signal.signalKey.startsWith("error:") ||
				signal.signalKey.startsWith("route:error:")) &&
			signal.metric.current > 0
				? materialErrorImpact
				: null,
		loadErrorCohortGoalCompletion: async () => null,
		loadVitalCohortBehavior: async () => null,
		loadDatabuddySetup: async () => null,
		loadHistory: unexpected,
		loadOtherOpenWork: async () => [],
		loadObservations: unexpected,
		remeasureSignal: unexpected,
		...overrides,
	};
}

async function investigateFixture(
	sources: InvestigationSources,
	input: Partial<
		Parameters<typeof investigateWebsitePortfolioWithSources>[0]
	> = {},
	canRunAgent?: () => Promise<boolean>,
	reason: "manual" | "scheduled" = "manual"
) {
	let remainingAgentRuns = 1;
	const artifacts = await investigateWebsitePortfolioWithSources(
		{ ...fixtureInput, ...input },
		sources,
		reason,
		canRunAgent ??
			(() => {
				const allowed = remainingAgentRuns > 0;
				remainingAgentRuns -= 1;
				return Promise.resolve(allowed);
			})
	);
	const artifact = artifacts[0];
	if (!artifact) {
		throw new Error("Fixture portfolio returned no artifact");
	}
	return artifact;
}

describe("fixture investigation sources", () => {
	it("keeps a detected generic metric visible but screened without invoking the agent", async () => {
		let agentCalls = 0;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop],
			investigateSignal: async () => {
				agentCalls += 1;
				throw new Error("The candidate inventory must not invoke the agent");
			},
			loadDueInvestigation: async () => null,
			loadObservations: async () => new Map(),
		});

		const inspection = await inspectWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

		expect(inspection.status).toBe("signals");
		if (inspection.status === "signals") {
			expect(inspection.detectedSignals).toEqual([trafficDrop]);
			expect(inspection.eligibleSignals).toEqual([trafficDrop]);
			expect(inspection.plan.selected).toEqual([]);
			expect(inspection.reachPlan.selected).toEqual([]);
			expect(inspection.plan.entries[0]?.omittedFor).toEqual(["unqualified"]);
			expect(inspection.qualifications).toMatchObject([
			{ reason: "generic_metric_without_impact", status: "screened" },
		]);
		}
		expect(agentCalls).toBe(0);
	});

	it("reserves one bounded error backfill window before scheduled selection", async () => {
		const errors = Array.from({ length: 8 }, (_, index): DetectedSignal => ({
			...trafficDrop,
			baseline: 10,
			current: 40 - index,
			deltaPercent: 300 - index,
			direction: "up",
			entityId: `fixture-error-${index + 1}`,
			entityLabel: `Fixture error ${index + 1}`,
			label: `Fixture error ${index + 1}`,
			metric: "error_count",
			severity: "warning",
			subjectKey: `error:fixture-error-${index + 1}`,
		}));
		let enrichmentCalls = 0;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => errors,
			loadDueInvestigation: async () => null,
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
				return materialErrorImpact;
			},
			loadObservations: async () => new Map(),
		});

		const inspection = await inspectWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"scheduled"
		);

		expect(enrichmentCalls).toBe(12);
		expect(inspection.status).toBe("signals");
		if (inspection.status === "signals") {
			expect(inspection.plan.selected).toHaveLength(2);
			expect(
				inspection.qualifications.filter(
					(qualification) => qualification.status === "qualified"
				)
			).toHaveLength(4);
			expect(
				inspection.qualifications.filter(
					(qualification) =>
						qualification.reason === "error_outside_qualification_budget"
				)
			).toHaveLength(4);
		}
	});

	it("backfills an independent material route after overlap covers a selected route", async () => {
		const broadError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 100,
			deltaPercent: 900,
			direction: "up",
			entityId: "fixture-fingerprint",
			entityLabel: "Fixture fingerprint",
			label: "Fixture fingerprint failures",
			metric: "error_count",
			reach: { current: 100, previous: 10, unit: "visitor_identifiers" },
			severity: "critical",
			subjectKey: "error:fixture-fingerprint",
		};
		const coveredRoute: DetectedSignal = {
			...broadError,
			current: 90,
			deltaPercent: 800,
			entityId: "/fixture-covered",
			entityLabel: "Covered fixture route",
			label: "Errors on covered fixture route",
			reach: { current: 90, previous: 10, unit: "visitor_identifiers" },
			severity: "warning",
			subjectKey: "route:error:/fixture-covered",
		};
		const independentRoute: DetectedSignal = {
			...coveredRoute,
			current: 80,
			deltaPercent: 700,
			entityId: "/fixture-independent",
			entityLabel: "Independent fixture route",
			label: "Errors on independent fixture route",
			reach: { current: 80, previous: 10, unit: "visitor_identifiers" },
			subjectKey: "route:error:/fixture-independent",
		};
		let enrichmentCalls = 0;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				broadError,
				coveredRoute,
				independentRoute,
			],
			loadDueInvestigation: async () => null,
			loadErrorCandidateOverlap: async ({ route }) =>
				route.signalKey === coveredRoute.subjectKey
					? {
							cooccurring: {
								errorOccurrences: 90,
								sessions: 90,
								visitorIdentifiers: 90,
							},
							fingerprint: {
								errorOccurrences: 100,
								sessions: 100,
								visitorIdentifiers: 100,
							},
							route: {
								errorOccurrences: 90,
								sessions: 90,
								visitorIdentifiers: 90,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 90, visitorIdentifiers: 90 },
							visitorOverlapMeasurable: true,
						}
					: {
							cooccurring: {
								errorOccurrences: 1,
								sessions: 1,
								visitorIdentifiers: 1,
							},
							fingerprint: {
								errorOccurrences: 100,
								sessions: 100,
								visitorIdentifiers: 100,
							},
							route: {
								errorOccurrences: 80,
								sessions: 80,
								visitorIdentifiers: 80,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 1, visitorIdentifiers: 1 },
							visitorOverlapMeasurable: true,
						},
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
				return materialErrorImpact;
			},
			loadObservations: async () => new Map(),
		});

		const inspection = await inspectWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"scheduled"
		);

		expect(enrichmentCalls).toBe(9);
		expect(inspection.status).toBe("signals");
		if (inspection.status !== "signals") {
			throw new Error("Expected a signal inventory");
		}
		expect(inspection.plan.selected.map((signal) => signal.subjectKey)).toEqual([
			broadError.subjectKey,
			independentRoute.subjectKey,
		]);
		expect(inspection.reachPlan.selected.map((signal) => signal.subjectKey)).toEqual([
			broadError.subjectKey,
			independentRoute.subjectKey,
		]);
		expect(inspection.overlapClustering).toMatchObject({
			passes: 2,
			redundantRouteSignalKeys: [coveredRoute.subjectKey],
			selectedCandidatesSettled: true,
		});
	});

	it("turns a manual full scan into a bounded portfolio of distinct exact-signal investigations", async () => {
		const seen: Array<{ related: string[]; signal: string }> = [];
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.52,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const checkoutGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "warning",
			subjectKey: "goal:checkout",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [checkoutGoal],
			detectMetricSignals: async () => [routeError, trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				seen.push({
					related: input.relatedSignals?.map((signal) => signal.signalKey) ?? [],
					signal: input.signal.signalKey,
				});
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifacts = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

			expect(artifacts).toHaveLength(2);
			expect(seen.map((item) => item.signal)).toEqual([
				"goal:checkout",
				"route:error:/explore",
			]);
			expect(seen.every((item) => item.related.length === 1)).toBe(true);
	});

	it("does not fill the manual cap with screened candidates", async () => {
		const seen: Array<{ related: string[]; signal: string }> = [];
		let setupLoads = 0;
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.52,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const checkoutGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "warning",
			subjectKey: "goal:checkout",
		};
		const bounceRate: DetectedSignal = {
			...trafficDrop,
			baseline: 40,
			current: 60,
			deltaPercent: 50,
			direction: "up",
			label: "Bounce rate",
			metric: "bounce_rate",
			severity: "warning",
		};
		const customEvent: DetectedSignal = {
			...trafficDrop,
			baseline: 100,
			current: 150,
			deltaPercent: 50,
			direction: "up",
			label: "Signup completions",
			metric: "custom_event_count",
			severity: "warning",
			subjectKey: "custom_event:signup_completed",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [checkoutGoal],
			detectMetricSignals: async () => [
				routeError,
				trafficDrop,
				bounceRate,
				revenueIncrease,
				customEvent,
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				seen.push({
					related: input.relatedSignals?.map((signal) => signal.signalKey) ?? [],
					signal: input.signal.signalKey,
				});
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadDatabuddySetup: async () => {
				setupLoads += 1;
				return null;
			},
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifacts = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

			expect(artifacts).toHaveLength(3);
			expect(new Set(seen.map((item) => item.signal))).toEqual(
				new Set([
					"goal:checkout",
					"route:error:/explore",
					"revenue",
				])
			);
			expect(seen.every((item) => item.related.length === 2)).toBe(true);
		expect(setupLoads).toBe(1);
	});

	it("keeps a proven redundant route as private context for its selected broad error", async () => {
		const seen: Array<{
			covered: string[];
			related: string[];
			signal: string;
		}> = [];
		const broadError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 38,
			deltaPercent: 65.22,
			direction: "up",
			entityId: "manifest-fingerprint",
			entityLabel: "Manifest fingerprint",
			label: "Manifest failures",
			metric: "error_count",
			reach: {
				current: 36,
				previous: 23,
				unit: "visitor_identifiers",
			},
			severity: "critical",
			subjectKey: "error:manifest-fingerprint",
		};
		const independentRoute: DetectedSignal = {
			...broadError,
			baseline: 2,
			current: 13,
			deltaPercent: 550,
			entityId: "/independent",
			entityLabel: "Independent route",
			label: "Errors on independent route",
			reach: { current: 7, previous: 2, unit: "visitor_identifiers" },
			severity: "warning",
			subjectKey: "route:error:/independent",
		};
		const redundantRoute: DetectedSignal = {
			...independentRoute,
			baseline: 6,
			current: 22,
			deltaPercent: 266.67,
			entityId: "/covered",
			entityLabel: "Covered route",
			label: "Errors on covered route",
			reach: { current: 16, previous: 6, unit: "visitor_identifiers" },
			subjectKey: "route:error:/covered",
		};
		const checkoutGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "warning",
			subjectKey: "goal:checkout",
		};
		const customEvent: DetectedSignal = {
			...trafficDrop,
			baseline: 100,
			current: 150,
			deltaPercent: 50,
			direction: "up",
			label: "Signup completions",
			metric: "custom_event_count",
			severity: "warning",
			subjectKey: "custom_event:signup_completed",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [checkoutGoal],
			detectMetricSignals: async () => [
				broadError,
				independentRoute,
				redundantRoute,
				trafficDrop,
				revenueIncrease,
				customEvent,
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				seen.push({
					covered:
						input.coveredRouteContext?.map((signal) => signal.signalKey) ?? [],
					related:
						input.relatedSignals?.map((signal) => signal.signalKey) ?? [],
					signal: input.signal.signalKey,
				});
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadErrorCandidateOverlap: async ({ route }) =>
				route.signalKey === redundantRoute.subjectKey
					? {
							cooccurring: {
								errorOccurrences: 14,
								sessions: 13,
								visitorIdentifiers: 13,
							},
							fingerprint: {
								errorOccurrences: 38,
								sessions: 36,
								visitorIdentifiers: 36,
							},
							route: {
								errorOccurrences: 22,
								sessions: 16,
								visitorIdentifiers: 16,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 13, visitorIdentifiers: 13 },
							visitorOverlapMeasurable: true,
						}
					: {
							cooccurring: {
								errorOccurrences: 1,
								sessions: 1,
								visitorIdentifiers: 1,
							},
							fingerprint: {
								errorOccurrences: 38,
								sessions: 36,
								visitorIdentifiers: 36,
							},
							route: {
								errorOccurrences: 13,
								sessions: 7,
								visitorIdentifiers: 7,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 1, visitorIdentifiers: 1 },
							visitorOverlapMeasurable: true,
						},
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifacts = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

			expect(artifacts).toHaveLength(4);
		expect(seen.map((item) => item.signal)).not.toContain(
			redundantRoute.subjectKey
		);
			expect(seen.map((item) => item.signal)).toContain(
				independentRoute.subjectKey
			);
			expect(
				seen.find((item) => item.signal === broadError.subjectKey)?.covered
			).toEqual([redundantRoute.subjectKey]);
			expect(
				seen
					.filter((item) => item.signal !== broadError.subjectKey)
					.every((item) => item.covered.length === 0)
			).toBe(true);
			expect(
				seen.every(
				(item) => !item.related.includes(redundantRoute.subjectKey ?? "")
			)
		).toBe(true);
			expect(seen.every((item) => item.related.length === 3)).toBe(true);
	});

	it("assigns a covered route to one selected broad error", async () => {
		const seen: Array<{ covered: string[]; signal: string }> = [];
		const firstBroadError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 40,
			deltaPercent: 300,
			direction: "up",
			entityId: "first-fingerprint",
			entityLabel: "First fingerprint",
			label: "First failure",
			metric: "error_count",
			reach: { current: 40, previous: 10, unit: "visitor_identifiers" },
			severity: "critical",
			subjectKey: "error:first-fingerprint",
		};
		const secondBroadError: DetectedSignal = {
			...firstBroadError,
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			entityId: "second-fingerprint",
			entityLabel: "Second fingerprint",
			label: "Second failure",
			reach: { current: 30, previous: 10, unit: "visitor_identifiers" },
			subjectKey: "error:second-fingerprint",
		};
		const coveredRoute: DetectedSignal = {
			...firstBroadError,
			baseline: 8,
			current: 20,
			deltaPercent: 150,
			entityId: "/covered",
			entityLabel: "Covered route",
			label: "Errors on covered route",
			reach: { current: 16, previous: 8, unit: "visitor_identifiers" },
			severity: "warning",
			subjectKey: "route:error:/covered",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				firstBroadError,
				secondBroadError,
				coveredRoute,
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				seen.push({
					covered:
						input.coveredRouteContext?.map((signal) => signal.signalKey) ?? [],
					signal: input.signal.signalKey,
				});
				return { outcome, toolCallCount: 0 };
			},
			loadDueInvestigation: async () => null,
			loadErrorCandidateOverlap: async ({ fingerprint, route }) => ({
				cooccurring: {
					errorOccurrences: 15,
					sessions: 15,
					visitorIdentifiers: 15,
				},
				fingerprint: {
					errorOccurrences: fingerprint.metric.current,
					sessions:
						fingerprint.signalKey === firstBroadError.subjectKey ? 40 : 30,
					visitorIdentifiers:
						fingerprint.signalKey === firstBroadError.subjectKey ? 40 : 30,
				},
				route: {
					errorOccurrences: route.metric.current,
					sessions: 16,
					visitorIdentifiers: 16,
				},
				sessionOverlapMeasurable: true,
				shared: { sessions: 15, visitorIdentifiers: 15 },
				visitorOverlapMeasurable: true,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifacts = await investigateWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

		expect(artifacts).toHaveLength(2);
		expect(seen.map((item) => item.signal)).not.toContain(
			coveredRoute.subjectKey
		);
		expect(
			seen.filter((item) => item.covered.includes(coveredRoute.subjectKey ?? ""))
		).toEqual([
			{
				covered: [coveredRoute.subjectKey],
				signal: firstBroadError.subjectKey,
			},
		]);
	});

	it("settles successive redundant route backfills before freezing the portfolio", async () => {
		const broadError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 38,
			deltaPercent: 65.22,
			direction: "up",
			entityId: "manifest-fingerprint",
			entityLabel: "Manifest fingerprint",
			label: "Manifest failures",
			metric: "error_count",
			reach: {
				current: 36,
				previous: 23,
				unit: "visitor_identifiers",
			},
			severity: "critical",
			subjectKey: "error:manifest-fingerprint",
		};
		const independentRoute: DetectedSignal = {
			...broadError,
			baseline: 2,
			current: 13,
			deltaPercent: 1_000,
			entityId: "/independent",
			entityLabel: "Independent route",
			label: "Errors on independent route",
			reach: { current: 7, previous: 2, unit: "visitor_identifiers" },
			severity: "warning",
			subjectKey: "route:error:/independent",
		};
		const redundantRoutes = [900, 800, 700, 600, 500, 400].map(
			(delta, index): DetectedSignal => ({
				...independentRoute,
				baseline: 5,
				current: 20,
				deltaPercent: delta,
				entityId: `/covered-${index + 1}`,
				entityLabel: `Covered route ${index + 1}`,
				label: `Errors on covered route ${index + 1}`,
				reach: { current: 10, previous: 5, unit: "visitor_identifiers" },
				subjectKey: `route:error:/covered-${index + 1}`,
			})
		);
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				broadError,
				independentRoute,
				...redundantRoutes,
			],
			loadDueInvestigation: async () => null,
			loadErrorCandidateOverlap: async ({ route }) =>
				route.signalKey === independentRoute.subjectKey
					? {
							cooccurring: {
								errorOccurrences: 1,
								sessions: 1,
								visitorIdentifiers: 1,
							},
							fingerprint: {
								errorOccurrences: 38,
								sessions: 36,
								visitorIdentifiers: 36,
							},
							route: {
								errorOccurrences: 13,
								sessions: 7,
								visitorIdentifiers: 7,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 1, visitorIdentifiers: 1 },
							visitorOverlapMeasurable: true,
						}
					: {
							cooccurring: {
								errorOccurrences: 12,
								sessions: 9,
								visitorIdentifiers: 9,
							},
							fingerprint: {
								errorOccurrences: 38,
								sessions: 36,
								visitorIdentifiers: 36,
							},
							route: {
								errorOccurrences: 20,
								sessions: 10,
								visitorIdentifiers: 10,
							},
							sessionOverlapMeasurable: true,
							shared: { sessions: 9, visitorIdentifiers: 9 },
							visitorOverlapMeasurable: true,
						},
			loadObservations: async () => new Map(),
		});

		const inspection = await inspectWebsitePortfolioWithSources(
			fixtureInput,
			sources,
			"manual"
		);

		expect(inspection.status).toBe("signals");
		if (inspection.status !== "signals") {
			throw new Error("Expected a signal inventory");
		}
		expect(inspection.plan.selected.map((signal) => signal.subjectKey)).toEqual([
			broadError.subjectKey,
			independentRoute.subjectKey,
		]);
		expect(
			inspection.reachPlan.selected.map((signal) => signal.subjectKey)
		).toEqual([broadError.subjectKey, independentRoute.subjectKey]);
		expect(inspection.overlapClustering).toMatchObject({
			candidatePairCount: 7,
			independentRouteSignalKeys: [independentRoute.subjectKey],
			measuredPairCount: 7,
			passes: 3,
			redundantRouteSignalKeys: redundantRoutes.map(
				(route) => route.subjectKey
			),
			selectedCandidatesSettled: true,
			unavailablePairCount: 0,
		});
	});

	it("finishes sibling candidates before retrying a failed agent candidate", async () => {
		const attempted: string[] = [];
		const failedGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "critical",
			subjectKey: "goal:checkout",
		};
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [failedGoal],
			detectMetricSignals: async () => [routeError, trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				if (input.signal.signalKey === failedGoal.subjectKey) {
					throw new InsightAgentGenerationError({
						cause: new Error("Model returned malformed structured output"),
						modelId: "test/model",
						toolCallCount: 0,
						usage: emptyUsage,
					});
				}
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("Model returned malformed structured output");
		expect(attempted).toEqual([
			"goal:checkout",
			"route:error:/explore",
		]);
	});

	it("finishes qualified siblings after a candidate-local agent timeout", async () => {
		const attempted: string[] = [];
		const timedOutGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "critical",
			subjectKey: "goal:checkout",
		};
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 30,
			deltaPercent: 200,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const bounceRate: DetectedSignal = {
			...trafficDrop,
			baseline: 40,
			current: 60,
			deltaPercent: 50,
			direction: "up",
			label: "Bounce rate",
			metric: "bounce_rate",
			severity: "warning",
		};
		const customEvent: DetectedSignal = {
			...trafficDrop,
			baseline: 100,
			current: 150,
			deltaPercent: 50,
			direction: "up",
			label: "Signup completions",
			metric: "custom_event_count",
			severity: "warning",
			subjectKey: "custom_event:signup_completed",
		};
		const outcome: InvestigationOutcome = {
			evidence: ["The selected signal was measured in the comparison window."],
			impact: null,
			next: { reason: "No action is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "The selected signal changed in the comparison window.",
			title: "Measured signal",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [timedOutGoal],
			detectMetricSignals: async () => [
				routeError,
				trafficDrop,
				bounceRate,
				revenueIncrease,
				customEvent,
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				if (input.signal.signalKey === timedOutGoal.subjectKey) {
					throw new InsightAgentTimeoutError({
						cause: new Error("Insights agent exceeded its local deadline"),
						modelId: "test/model",
						toolCallCount: 0,
						usage: emptyUsage,
					});
				}
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("Insights agent exceeded its local deadline");
		expect(new Set(attempted)).toEqual(
			new Set([
				"goal:checkout",
				"route:error:/explore",
				"revenue",
			])
		);
		expect(attempted).toHaveLength(3);
	});

	it("adds aggregate customer and behavior context before an error reaches the agent", async () => {
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.5,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		let received: Parameters<InvestigationSources["investigateSignal"]>[0] | null =
			null;
		const outcome: InvestigationOutcome = {
			evidence: ["The exact error cohort was measured."],
			impact: "Thirty-five visitor identifiers were affected.",
			next: { reason: "No case is required in this fixture.", type: "resolve" },
			rootCause: null,
			summary: "Route-loading failures affected the explore route.",
			title: "Explore route hit loading failures",
		};
		const setup = {
			configurationState: "current" as const,
			conversionMeasurement: { activeFunnels: 0, activeGoals: 0 },
			customEvents: { eventTypes: 2, sessionsWithCustomEvents: 12 },
			identity: {
				coveragePercent: 0,
				identifiedProfiles: 0,
				identifiedSessions: 0,
				trackedSessions: 34,
			},
			observedPeriod: { from: "2026-07-04", to: "2026-07-10" },
			releases: {
				activeFlags: { boolean: 0, multivariant: 0, rollout: 0 },
				inactiveFlags: 0,
				targetGroups: 0,
			},
			revenue: {
				paddleConfigured: false,
				stripeConfigured: false,
				websiteConfigPresent: false,
			},
			traffic: { pageviews: 80, sessions: 34 },
		};
		let behaviorLoads = 0;
		let customerImpactLoads = 0;
		let goalCompletionLoads = 0;
		const errorBehavior = {
			affectedNextPagePercent: 10,
			comparisonNextPagePercent: 60,
			eligibleErrorSessions: 34,
			matchedCoveragePercent: 100,
			matchedErrorSessions: 34,
			matchedPeerSessionObservations: 48,
			matchedStrata: 1,
		};
		const customerImpact: ErrorCustomerImpact = {
			affectedSessions: 34,
			affectedVisitorIdentifiers: 35,
			ambiguousProfileSessions: 0,
			errorOccurrences: 36,
			identifiedProfiles: 0,
			identifiedProfilesWithPriorAttributedCompletedPayment: 0,
			identityCoveragePercent: 0,
			linkedVisitorIdentifiers: 0,
			paymentMatchIsLowerBound: true,
			qualifyingProfilePaymentHistoryObserved: false,
			sessionsWithLaterTelemetry: 20,
			scope: "route",
			unlinkedVisitorIdentifiers: 35,
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [routeError],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				received = input;
				return { outcome, toolCallCount: 0 };
			},
			loadDueInvestigation: async () => null,
			loadErrorCohortBehavior: async () => {
				behaviorLoads += 1;
				return errorBehavior;
			},
			loadErrorCustomerImpact: async () => {
				customerImpactLoads += 1;
				return customerImpact;
			},
			loadErrorCohortGoalCompletion: async () => {
				goalCompletionLoads += 1;
				return {
					affectedCompletionPercent: 8.8,
					affectedCompletionSessions: 3,
					comparisonCompletionPercent: 45,
					eligibleErrorSessions: 40,
					matchedCoveragePercent: 85,
					matchedErrorSessions: 34,
					matchedPeerSessionObservations: 380,
					matchedStrata: 4,
				};
			},
			loadDatabuddySetup: async () => setup,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(received?.customerImpact).toMatchObject({
			affectedVisitorIdentifiers: 35,
			identifiedProfilesWithPriorAttributedCompletedPayment: 0,
		});
		expect(received?.errorBehavior).toEqual({
			affectedNextPagePercent: 10,
			comparisonNextPagePercent: 60,
			eligibleErrorSessions: 34,
			matchedCoveragePercent: 100,
			matchedErrorSessions: 34,
			matchedPeerSessionObservations: 48,
			matchedStrata: 1,
		});
		expect(received?.errorBehaviorEvidenceIndex).toBe(
			received?.evidence.indexOf(errorCohortBehaviorEvidence(errorBehavior))
		);
		expect(received?.errorGoalCompletion).toEqual({
			affectedCompletionPercent: 8.8,
			affectedCompletionSessions: 3,
			comparisonCompletionPercent: 45,
			eligibleErrorSessions: 40,
			matchedCoveragePercent: 85,
			matchedErrorSessions: 34,
			matchedPeerSessionObservations: 380,
			matchedStrata: 4,
		});
		expect(received?.errorGoalCompletionEvidenceIndex).toBe(
			received?.evidence.findIndex((item) =>
				item.includes("reached the configured completion within")
			)
		);
		expect(received?.databuddySetup).toEqual(setup);
		expect(received?.setupRecommendationCandidate).toEqual({
			action:
				"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
			feature: "user_identification",
			kind: "databuddy_setup",
		});
		expect(received?.evidence).toContain(
			errorCustomerImpactEvidence(customerImpact)
		);
		expect(artifact.evidence).toEqual(received?.evidence ?? []);
		expect(behaviorLoads).toBe(1);
		expect(customerImpactLoads).toBe(1);
		expect(goalCompletionLoads).toBe(1);
	});

	it("passes annotations as non-citable investigation context", async () => {
		const routeError: DetectedSignal = {
			...trafficDrop,
			baseline: 23,
			current: 36,
			deltaPercent: 56.5,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			definitionEvidence:
				"The route definition includes private configuration context for investigation.",
			displayEvidence:
				"The selected route recorded more errors in the measured period.",
			label: "Errors on /explore",
			metric: "error_count",
			severity: "warning",
			subjectKey: "route:error:/explore",
		};
		const annotationContext =
			"Annotation: 2026-07-10: A release was planned during this period";
		let received: Parameters<InvestigationSources["investigateSignal"]>[0] | null =
			null;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [routeError],
			fetchAnnotations: async () => [
				{
					date: "2026-07-10",
					title: "A release was planned during this period",
				},
			],
			investigateSignal: async (input) => {
				received = input;
				return {
					outcome: {
						evidence: ["The error cohort was measured."],
						impact: null,
						next: {
							reason: "No action is required in this fixture.",
							type: "resolve",
						},
						rootCause: null,
						summary: "The route error was measured.",
						title: "Route error was measured",
					},
					toolCallCount: 0,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		if (!received) {
			throw new Error("The annotation fixture did not reach the agent");
		}
		expect(received.annotationContext).toBe(annotationContext);
		expect(received.definitionContext).toBe(
			"The route definition includes private configuration context for investigation."
		);
		expect(received.evidence).not.toContain(annotationContext);
		expect(received.evidence).not.toContain(received.definitionContext);
		expect(artifact.evidence).toEqual(received.evidence);
		expect(artifact.evidence).not.toContain(annotationContext);
		expect(artifact.evidence).not.toContain(received.definitionContext);
	});

	it("reuses qualifying slow-route-vital evidence from admission in the selected agent context", async () => {
		const routeVital: DetectedSignal = {
			...trafficDrop,
			baseline: 2300,
			current: 3600,
			deltaPercent: 56.5,
			direction: "up",
			entityId: "/explore",
			entityLabel: "Route /explore",
			label: "Largest Contentful Paint on /explore",
			metric: "lcp",
			severity: "warning",
			subjectKey: "route:lcp:/explore",
		};
		let received: Parameters<InvestigationSources["investigateSignal"]>[0] | null =
			null;
		let vitalBehaviorLoads = 0;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [routeVital],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				received = input;
				return {
					outcome: {
						evidence: ["The selected route vital was measured."],
						impact: null,
						next: { reason: "No action is required in this fixture.", type: "resolve" },
						rootCause: null,
						summary: "The selected route vital changed.",
						title: "Route vital changed",
					},
					toolCallCount: 0,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
			loadVitalCohortBehavior: async () => {
				vitalBehaviorLoads += 1;
				return {
					comparisonNextPagePercent: 55,
					eligibleSlowSessions: 40,
					matchedCoveragePercent: 85,
					matchedPeerSessionObservations: 380,
					matchedSlowSessions: 34,
					matchedStrata: 4,
					metric: "LCP",
					slowNextPagePercent: 20,
				};
			},
		});

		const artifact = await investigateFixture(sources);

		expect(received?.vitalBehavior).toEqual({
			comparisonNextPagePercent: 55,
			eligibleSlowSessions: 40,
			matchedCoveragePercent: 85,
			matchedPeerSessionObservations: 380,
			matchedSlowSessions: 34,
			matchedStrata: 4,
			metric: "LCP",
			slowNextPagePercent: 20,
		});
		expect(received?.vitalBehaviorEvidenceIndex).toBe(
			received?.evidence.findIndex((item) =>
				item.includes("reached another tracked page within 30 minutes")
			)
		);
		expect(
			received?.evidence.at(received.vitalBehaviorEvidenceIndex ?? -1)
		).toContain("association, not causation");
		expect(artifact.evidence).toEqual(received?.evidence ?? []);
		expect(vitalBehaviorLoads).toBe(1);
	});

	it("screens a warning route vital before it consumes an agent turn", async () => {
		const routeVital: DetectedSignal = {
			...trafficDrop,
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
		let agentCalls = 0;
		let vitalBehaviorLoads = 0;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [routeVital],
			investigateSignal: async () => {
				agentCalls += 1;
				throw new Error("Warning vital should have been screened");
			},
			loadDueInvestigation: async () => null,
			loadObservations: async () => new Map(),
			loadVitalCohortBehavior: async () => {
				vitalBehaviorLoads += 1;
				return null;
			},
		});

		const artifact = await investigateFixture(sources);

		expect(artifact.status).toBe("no_signals");
		expect(agentCalls).toBe(0);
		expect(vitalBehaviorLoads).toBe(1);
	});

	it("stops sibling candidates after an agent infrastructure failure", async () => {
		const attempted: string[] = [];
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop, revenueIncrease],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				throw new Error("AI gateway configuration is unavailable");
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("AI gateway configuration is unavailable");
		expect(attempted).toEqual(["revenue"]);
	});

	it("stops a portfolio immediately when a durable context dependency fails", async () => {
		const attempted: string[] = [];
		const annotationCalls: string[] = [];
		const failedGoal: DetectedSignal = {
			...trafficDrop,
			label: "Checkout completion rate",
			metric: "goal:checkout",
			severity: "critical",
			subjectKey: "goal:checkout",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [failedGoal],
			detectMetricSignals: async () => [trafficDrop],
			fetchAnnotations: async (_websiteId, signal) => {
				annotationCalls.push(signal.signalKey);
				throw new Error("Annotation storage unavailable");
			},
			investigateSignal: async (input) => {
				attempted.push(input.signal.signalKey);
				throw new Error("This agent should not run");
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(
			investigateWebsitePortfolioWithSources(
				fixtureInput,
				sources,
				"manual"
			)
		).rejects.toThrow("Annotation storage unavailable");
		expect(annotationCalls).toEqual(["goal:checkout"]);
		expect(attempted).toEqual([]);
	});

	it("resolves a date-only run to one exact instant in the website timezone", () => {
		expect(resolveInvestigationAsOf("2026-07-12", "Asia/Hebron")).toEqual(
			new Date("2026-07-11T21:00:00.000Z")
		);
	});

	it("runs the production investigation path using only required sources", async () => {
		const calls: string[] = [];
		let receivedHistoryBody: string | undefined;
		let receivedOpenWorkTitle: string | undefined;
		let receivedRepository: { owner: string; repo: string } | null = null;
		let receivedRelatedMetrics: string[] = [];
		const outcome: InvestigationOutcome = {
			title: "Organic search traffic fell",
			summary: "Organic search accounts for most of the visitor decline.",
			impact: "Visitors fell from 1,000 to 300.",
			rootCause: null,
			evidence: ["Visitors fell 70% in the comparison window."],
			next: {
				type: "ask",
				question:
					"Did a planned acquisition change begin before the organic traffic decline?",
			},
		};
		const sources = fixtureSources({
			loadDueInvestigation: async () => {
				calls.push("due investigation");
				return null;
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop, revenueIncrease];
			},
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			detectMeasurementRecommendationSignals: async () => {
				calls.push("measurement recommendation detection");
				return [measurementCoverage];
			},
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
			fetchAnnotations: async () => {
				calls.push("annotations");
				return [];
			},
			investigateSignal: async (input) => {
				calls.push(`agent:${input.signal.signalKey}`);
				receivedHistoryBody = input.history.find(
					(item) => item.kind === "reply"
				)?.body;
				receivedOpenWorkTitle = input.otherOpenWork[0]?.title;
				receivedRepository = input.githubRepository;
				receivedRelatedMetrics =
					input.relatedSignals?.map((signal) => signal.signalKey) ?? [];
				return {
					outcome,
					toolCallCount: 1,
				};
			},
			loadHistory: async () => {
				calls.push("history");
				return [
					{
						author: "Ari",
						body: "The campaign was intentionally paused.",
						createdAt: "2026-07-11T12:00:00.000Z",
						kind: "reply",
					},
				];
			},
			loadOtherOpenWork: async () => {
				calls.push("other open work");
				return [
					{
						asOf: "2026-07-10T12:00:00.000Z",
						next: {
							question: "Connect the repository that owns checkout.",
							type: "ask",
						},
						title: "Checkout repository access",
					},
				];
			},
		});

		const artifact = await investigateFixture(sources, {
				githubRepository: { owner: "databuddy-analytics", repo: "app" },
		});

		expect(artifact).toMatchObject({
			outcome,
			status: "completed",
		});
		expect(artifact.signal?.signalKey).toBe("revenue");
		expect(receivedHistoryBody).toBe(
			"The campaign was intentionally paused."
		);
		expect(receivedOpenWorkTitle).toBe("Checkout repository access");
		expect(receivedRepository).toEqual({
			owner: "databuddy-analytics",
			repo: "app",
		});
		expect(receivedRelatedMetrics).toEqual([
			"measurement:conversion-coverage",
		]);
		expect(calls.sort()).toEqual(
			[
					"agent:revenue",
				"annotations",
				"definition detection",
				"due investigation",
				"history",
				"measurement recommendation detection",
				"metric detection",
				"observations",
				"other open work",
			].sort()
		);
	});

	it("retries an incomplete scan before reading evidence", async () => {
		const calls: string[] = [];
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async (_params, _today, _deps, options) => {
				calls.push("definition detection");
				expect(options?.abortSignal).toBeDefined();
				if (options?.diagnostics) {
					options.diagnostics.failedDefinitions = 0;
				}
				return [];
			},
			detectMetricSignals: async (
				_params,
				_query,
				_today,
				_abort,
				diagnostics
			) => {
				calls.push("metric detection");
				if (diagnostics) {
					diagnostics.failedFamilies = 1;
				}
				return [];
			},
		});

		await expect(investigateFixture(sources)).rejects.toThrow(
			"Insight detection was incomplete"
		);
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("propagates a failed measurement recommendation scan", async () => {
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMeasurementRecommendationSignals: async () => {
				throw new Error("Measurement telemetry unavailable");
			},
			detectMetricSignals: async () => [],
			loadDueInvestigation: async () => null,
		});

	await expect(investigateFixture(sources)).rejects.toThrow(
			"Measurement telemetry unavailable"
		);
	});

	it("passes the detector's safe measurement candidate to the agent", async () => {
		let candidate: unknown;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMeasurementRecommendationSignals: async () => [measurementCoverage],
			detectMetricSignals: async () => [],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				candidate = input.measurementCandidate;
				return {
					outcome: {
						evidence: ["A completion event was observed."],
						impact: null,
						next: {
							reason: "The measurement draft is ready for review.",
							type: "resolve",
						},
						publish: true,
						rootCause: null,
						summary: "Conversion measurement is not configured.",
						title: "Conversion measurement is missing",
					},
					toolCallCount: 0,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(artifact.signal?.signalKey).toBe(
			"measurement:conversion-coverage"
		);
		expect(candidate).toEqual(measurementCoverage.measurementCandidate);
	});

	it("passes a backend-owned measurement-gap guide to the agent", async () => {
		let candidate: unknown;
		const measurementGap = {
			...measurementCoverage,
			measurementCandidate: undefined,
			measurementGapRecommendationCandidate: {
				action:
					"Choose the completed behavior to measure around /signup, instrument it as a Databuddy custom event, then review the observed event as a goal or funnel.",
				kind: "measurement_gap" as const,
				route: "/signup",
			},
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMeasurementRecommendationSignals: async () => [measurementGap],
			detectMetricSignals: async () => [],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				candidate = input.measurementGapRecommendationCandidate;
				return {
					outcome: {
						evidence: ["Conversion measurement is not configured."],
						impact: null,
						next: {
							reason: "The measurement guide is ready for review.",
							type: "resolve",
						},
						publish: true,
						rootCause: null,
						summary: "Conversion measurement is not configured.",
						title: "Conversion measurement is missing",
					},
					toolCallCount: 0,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await investigateFixture(sources);

		expect(candidate).toEqual(
			measurementGap.measurementGapRecommendationCandidate
		);
	});

	it("does not send an informational generic change to the agent", async () => {
		let investigated: string | undefined;
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, severity: "info" },
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["Visitors fell in the measured period."],
						impact: null,
						next: {
							escalation:
								"Escalate if the decline continues into the next period.",
							type: "watch",
						},
						publish: true,
						rootCause: null,
						summary: "Visitors fell, without a confirmed broken workflow.",
						title: "Visitor traffic declined",
					},
					toolCallCount: 1,
				};
			},
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

			expect(investigated).toBeUndefined();
			expect(artifact).toMatchObject({
				signal: null,
				status: "no_signals",
			});
	});

	it("investigates an improvement for the brief", async () => {
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [revenueIncrease],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => ({
				outcome: {
					evidence: ["Revenue rose from 100 to 140."],
					impact: "Revenue increased by 40 in the comparison window.",
					next: {
						reason: "The improvement does not require corrective work.",
						type: "resolve",
					},
					publish: true,
					rootCause: null,
					summary: "Revenue increased from 100 to 140.",
					title: "Revenue improved",
				},
				toolCallCount: 1,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		const artifact = await investigateFixture(sources);

		expect(artifact).toMatchObject({
			outcome: { title: "Revenue improved" },
			signal: { sentiment: "positive", signalKey: "revenue" },
			status: "completed",
		});
	});

	it("retries instead of freezing definition work from a partial scan", async () => {
		const goalDrop = {
			...trafficDrop,
			label: "Checkout goal",
			metric: "goal:checkout",
			severity: "info" as const,
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [goalDrop],
			detectMetricSignals: async () => {
				throw new Error("Metric detection unavailable");
			},
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["Checkout goal completion fell."],
						impact: null,
						next: { question: "Was this expected?", type: "ask" },
						rootCause: null,
						summary: "Checkout goal completion fell.",
						title: "Checkout goal",
					},
					toolCallCount: 1,
				};
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
		});

		await expect(investigateFixture(sources)).rejects.toThrow(
			"Metric detection unavailable"
		);
		expect(investigated).toBeUndefined();
	});

	it("keeps direct goal regressions but screens recovered still-unhealthy vitals", async () => {
		const cases = [
			{
				detected: {
						...trafficDrop,
						baseline: 100,
						current: 51,
						deltaPercent: -49,
						label: "Checkout completion rate",
						metric: "goal:checkout",
						severity: "info" as const,
					},
				expectedSeen: ["negative"],
				expectedStatus: "completed",
			},
			{
				detected: {
						...trafficDrop,
						baseline: 4000,
						current: 3000,
						deltaPercent: -25,
						label: "Largest contentful paint",
						metric: "lcp",
						severity: "info" as const,
					},
				expectedSeen: [],
				expectedStatus: "no_signals",
			},
		] as const;
		for (const current of cases) {
			const seen: string[] = [];
			const sources = fixtureSources({
				loadDueInvestigation: async () => null,
				detectDefinitionSignals: async () => [],
				detectMetricSignals: async () => [current.detected],
				fetchAnnotations: async () => [],
				investigateSignal: async (input) => {
					seen.push(input.signal.sentiment);
					return {
						outcome: {
							evidence: ["The selected signal was measured."],
							impact: null,
							next: { reason: "No action is required.", type: "resolve" },
							rootCause: null,
							summary: "The selected signal changed.",
							title: "Measured signal",
						},
						toolCallCount: 1,
					};
				},
				loadHistory: async () => [],
				loadObservations: async () => new Map(),
			});

			const artifact = await investigateFixture(sources);

			expect(seen).toEqual(current.expectedSeen);
			expect(artifact.status).toBe(current.expectedStatus);
		}
	});

	it("checks agent access only after deterministic detection", async () => {
		const calls: string[] = [];
		const sources = fixtureSources({
			loadDueInvestigation: async () => null,
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
				detectMetricSignals: async () => {
					calls.push("metric detection");
					return [revenueIncrease];
			},
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
		});

		const artifact = await investigateFixture(
			sources,
			{},
			async () => {
				calls.push("agent access");
				return false;
			}
		);

		expect(artifact).toMatchObject({
			outcome: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			[
				"agent access",
				"definition detection",
				"metric detection",
				"observations",
			].sort()
		);
	});

	it("remeasures a due case even after it disappears from detection", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const recovered: DetectedSignal = {
			...trafficDrop,
			baseline: 900,
			current: 920,
			deltaPercent: 2.22,
			detectedAt: "2026-07-18",
			direction: "up",
			severity: "info",
		};
		const resolved: InvestigationOutcome = {
			evidence: ["Visitors recovered in the newest complete week."],
			impact: null,
			next: { reason: "Traffic recovered.", type: "resolve" },
			rootCause: null,
			summary: "Traffic returned to its prior range.",
			title: "Traffic recovered",
		};
		let currentWindow: { from: string; to: string } | undefined;
		let historicalWindow: { from: string; to: string } | undefined;
		const sources = fixtureSources({
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				currentWindow = input.signal.period.current;
				historicalWindow = input.history.find(
					(item) => item.kind === "investigation"
				)?.signal.period.current;
				return { outcome: resolved, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => ({
				evidence: prior.evidence,
				outcome: {
					...resolved,
					next: {
						question: "Did anything intentionally change?",
						type: "ask",
					},
				},
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [
				{
					asOf: "2026-07-12T00:00:00.000Z",
					evidence: prior.evidence,
					kind: "investigation",
					outcome: {
						...resolved,
						next: {
							question: "Did anything intentionally change?",
							type: "ask",
						},
					},
					signal: prior.signal,
				},
			],
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [],
			loadObservations: async () => new Map(),
			remeasureSignal: async (_params, signal) => {
				expect(signal.signalKey).toBe(prior.signal.signalKey);
				return recovered;
			},
		});

		const artifact = await investigateFixture(sources, {
			asOf: "2026-07-19",
		});

		expect(artifact.status).toBe("completed");
		expect(artifact.signal?.signalKey).toBe(prior.signal.signalKey);
		expect(currentWindow?.to).toBe("2026-07-18");
		expect(historicalWindow?.to).toBe("2026-07-11");
	});

	it("retries when due remeasurement makes the scan incomplete", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const outcome: InvestigationOutcome = {
			evidence: ["Revenue fell in the newest complete week."],
			impact: null,
			next: { reason: "No customer impact was confirmed.", type: "resolve" },
			rootCause: null,
			summary: "Revenue changed without a confirmed failure.",
			title: "Revenue changed",
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [
				{ ...trafficDrop, label: "Revenue", metric: "revenue" },
			],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return { outcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome: {
					...outcome,
					next: { question: "Was this expected?", type: "ask" },
				},
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [],
			loadObservations: async () => new Map(),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
		expect(investigated).toBeUndefined();
	});

	it("retries when a failed due recheck leaves no actionable work", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const outcome: InvestigationOutcome = {
			evidence: [],
			impact: null,
			next: { question: "Was this expected?", type: "ask" },
			rootCause: null,
			summary: "Visitors fell.",
			title: "Visitor decline",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [revenueIncrease],
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadObservations: async () => new Map(),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
	});

	it("keeps an unchanged signal in cooldown during another full scan", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const priorOutcome: InvestigationOutcome = {
			evidence: ["Visitors fell in the previous complete week."],
			impact: null,
			next: {
				escalation: "Escalate if the decline continues into the next period.",
				type: "watch",
			},
			rootCause: null,
			summary: "Visitors fell without a confirmed broken workflow.",
			title: "Visitor traffic declined",
		};
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [trafficDrop],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return { outcome: priorOutcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: priorOutcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
		});

		const artifact = await investigateFixture(
			sources,
			{ asOf: "2026-07-19" },
			undefined,
			"scheduled"
		);

		expect(investigated).toBeUndefined();
		expect(artifact.status).toBe("deferred");
	});

	it("uses qualified cooling signals as a fallback when a manual portfolio has no fresh work", async () => {
		const prior = prepareInvestigation(revenueIncrease, 7);
		const priorOutcome: InvestigationOutcome = {
				evidence: ["Revenue changed in the previous complete week."],
			impact: null,
			next: {
				escalation: "Escalate if the decline continues into the next period.",
				type: "watch",
			},
			rootCause: null,
				summary: "Revenue changed in the comparison window.",
				title: "Revenue changed",
		};
		const investigated: string[] = [];
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [revenueIncrease],
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated.push(input.signal.signalKey);
				return { outcome: priorOutcome, toolCallCount: 1 };
			},
			loadDueInvestigation: async () => null,
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: priorOutcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
		});

		const artifacts = await investigateWebsitePortfolioWithSources(
			{ ...fixtureInput, asOf: "2026-07-19" },
			sources,
			"manual"
		);

		expect(artifacts).toHaveLength(1);
		expect(artifacts[0]?.status).toBe("completed");
		expect(investigated).toEqual([prior.signal.signalKey]);
	});

	it("retries when the only fresh regression is still in cooldown", async () => {
		const prior = prepareInvestigation(trafficDrop, 7);
		const coolingError: DetectedSignal = {
			...trafficDrop,
			baseline: 10,
			current: 20,
			deltaPercent: 100,
			direction: "up",
			label: "Checkout error",
			metric: "error_count",
			subjectKey: "error:checkout",
		};
		const cooling = prepareInvestigation(coolingError, 7);
		const outcome: InvestigationOutcome = {
			evidence: ["The checkout error affected 20 requests."],
			impact: null,
			next: { question: "Was this expected?", type: "ask" },
			rootCause: null,
			summary: "The checkout error remains active.",
			title: "Checkout error",
		};
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => [coolingError],
			loadDueInvestigation: async () => ({
				evidence: [],
				outcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadObservations: async () =>
				new Map([
					[
						cooling.signal.signalKey,
						{
							outcome,
							recheckAt: new Date("2026-07-26T00:00:00.000Z"),
							signal: cooling.signal,
						},
					],
				]),
			remeasureSignal: async () => {
				throw new Error("Due remeasurement unavailable");
			},
		});

		await expect(
			investigateFixture(sources, { asOf: "2026-07-19" })
		).rejects.toThrow("Due remeasurement unavailable");
	});

	it("keeps unresolved due work ahead of fresh regressions", async () => {
		const dueError: DetectedSignal = {
			...trafficDrop,
			baseline: 0,
			current: 113,
			deltaPercent: 100,
			direction: "up",
			label: "Clerk duplicate provider error",
			metric: "error_count",
			subjectKey: "error:clerk-duplicate-provider",
		};
		const prior = prepareInvestigation(dueError, 7);
		const dueOutcome: InvestigationOutcome = {
			evidence: ["The Clerk runtime error remains active."],
			impact: "30 users encountered the runtime error.",
			next: {
				action: "Remove the duplicate Clerk provider.",
				target: "Clerk provider setup",
				type: "act",
				verification: "The exact error affects zero users for seven days.",
			},
			rootCause: "Multiple Clerk providers render in the React tree.",
			summary: "The Clerk runtime error remains active.",
			title: "Clerk duplicate provider error",
		};
		const freshError: DetectedSignal = {
			...trafficDrop,
			baseline: 0,
			current: 100,
			deltaPercent: 100,
			direction: "up",
			label: "Checkout error",
			metric: "error_count",
			subjectKey: "error:checkout-boom",
		};
		let detectorCalls = 0;
		let remeasureCalls = 0;
		let investigated: string | undefined;
		const sources = fixtureSources({
			detectDefinitionSignals: async () => [],
			detectMetricSignals: async () => {
				detectorCalls += 1;
				return [freshError];
			},
			fetchAnnotations: async () => [],
			investigateSignal: async (input) => {
				investigated = input.signal.signalKey;
				return {
					outcome: {
						evidence: ["The checkout error affected 100 requests."],
						impact: null,
						next: {
							escalation:
								"Escalate if the checkout error affects more users tomorrow.",
							type: "watch",
						},
						rootCause: null,
						summary: "A new checkout error appeared.",
						title: "Checkout error appeared",
					},
					toolCallCount: 1,
				};
			},
			loadDueInvestigation: async () => ({
				evidence: prior.evidence,
				outcome: dueOutcome,
				recheckAt: new Date("2026-07-18T00:00:00.000Z"),
				signal: prior.signal,
			}),
			loadHistory: async () => [],
			loadObservations: async () =>
				new Map([
					[
						prior.signal.signalKey,
						{
							outcome: dueOutcome,
							recheckAt: new Date("2026-07-18T00:00:00.000Z"),
							signal: prior.signal,
						},
					],
				]),
			remeasureSignal: async () => {
				remeasureCalls += 1;
				return {
					...dueError,
					baseline: 219,
					current: 172,
					deltaPercent: -21.46,
					direction: "down",
					severity: "info",
				};
			},
		});

		const artifact = await investigateFixture(sources, {
			asOf: "2026-07-19",
		});

		expect(detectorCalls).toBe(1);
		expect(remeasureCalls).toBe(1);
		expect(investigated).toBe("error:clerk-duplicate-provider");
		expect(artifact.signal?.signalKey).toBe("error:clerk-duplicate-provider");
	});
});
