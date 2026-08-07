import { describe, expect, it } from "bun:test";
import type { CoveragePortfolioPlan } from "./coverage-planner";
import type { DetectedSignal } from "./detection";
import type { WebsitePortfolioInspection } from "./generation";
import {
	metricFamily,
	countCandidateRetries,
	countRecoveredCandidateRetries,
	countUnresolvedShadowErrors,
	parseOptions,
	projectBriefProvenance,
	projectErrorCandidateOverlap,
	projectSelectionAudit,
	shadowFailureCategory,
	projectTimeoutMetadata,
	resolveShadowAsOf,
} from "./production-shadow";

describe("resolveShadowAsOf", () => {
	it("uses the frozen instant when replaying a manual run", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "instant").toISOString()
		).toBe("2026-07-31T13:42:00.000Z");
	});

	it("preserves the existing calendar-day replay mode", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "day").toISOString()
		).toBe("2026-07-31T00:00:00.000Z");
	});
});

describe("shadow signal projection", () => {
	it("counts repeated candidate signals without retaining identities", () => {
		expect(countCandidateRetries([])).toBe(0);
		expect(countCandidateRetries(["signal-a", "signal-b", "signal-a", "signal-a"])).toBe(
			2
		);
	});

	it("distinguishes recovered retries from unresolved errors", () => {
		expect(
			countRecoveredCandidateRetries([
				{ signalKey: "signal-a", succeeded: false },
				{ signalKey: "signal-b", succeeded: true },
				{ signalKey: "signal-a", succeeded: true },
				{ signalKey: "signal-a", succeeded: false },
			])
		).toBe(1);
		expect(countUnresolvedShadowErrors(2, 1)).toBe(1);
		expect(countUnresolvedShadowErrors(1, 1)).toBe(0);
		expect(countUnresolvedShadowErrors(0, 1)).toBe(0);
	});

	it("keeps failure diagnostics in fixed redacted categories", () => {
		expect(shadowFailureCategory("InsightAgentTimeoutError", false)).toBe(
			"agent_timeout"
		);
		expect(shadowFailureCategory("InsightAgentGenerationError", false)).toBe(
			"agent_generation"
		);
		expect(shadowFailureCategory("InsightAgentExecutionError", false)).toBe(
			"agent_execution"
		);
		expect(shadowFailureCategory("ProviderFailure", false)).toBe("other");
		expect(shadowFailureCategory(null, true)).toBe("agent_timeout");
	});

	it("never exposes a route or error subject in the report metric family", () => {
		expect(metricFamily("route:lcp:/settings/billing")).toBe("route_health");
		expect(
			metricFamily(
				"error:[nuxt] Received malformed app manifest with a customer path"
			)
		).toBe("error");
	});

	it("keeps brief provenance aggregate-only", () => {
		const projected = projectBriefProvenance({
			claimRefs: {
				impact: { index: 42, source: "provided" },
				problem: { name: "private_tool_name", source: "tool" },
				rootCause: null,
			},
			scope: "error_fingerprint",
			userExperience: "observed_session_behavior",
		});

		expect(projected).toEqual({
			claimSources: {
				impact: "provided",
				problem: "tool",
				rootCause: null,
			},
			scope: "error_fingerprint",
			userExperience: "observed_session_behavior",
		});
		expect(JSON.stringify(projected)).not.toContain("private_tool_name");
		expect(JSON.stringify(projected)).not.toContain("42");
	});

	it("keeps timeout diagnostics numeric and separate from failure text", () => {
		const timeout = Object.assign(new Error("Private timeout context"), {
			name: "InsightAgentTimeoutError",
			timeout: {
				budgetMs: 120_000,
				elapsedMs: 120_321,
				overdueMs: 321,
				phase: "setup" as const,
			},
		});

		expect(projectTimeoutMetadata(timeout)).toEqual({
			budgetMs: 120_000,
			elapsedMs: 120_321,
			overdueMs: 321,
			phase: "setup",
		});
		expect(
			projectTimeoutMetadata(
				Object.assign(new Error("Malformed timeout"), {
					name: "InsightAgentTimeoutError",
					timeout: { budgetMs: -1 },
				})
			)
		).toBeNull();
		expect(
			projectTimeoutMetadata(
				Object.assign(new Error("Inconsistent timeout"), {
					name: "InsightAgentTimeoutError",
					timeout: {
						budgetMs: 120_000,
						elapsedMs: 119_999,
						overdueMs: 1,
						phase: "generation",
					},
				})
			)
		).toBeNull();
	});
});

function inventoryFixture(): WebsitePortfolioInspection {
	const selected: DetectedSignal = {
		baseline: 10,
		current: 30,
		deltaPercent: 200,
		detectedAt: "2026-08-01",
		direction: "up",
		entityId: "/private-zone",
		entityLabel: "Example failure with sensitive label",
		label: "Errors on /private-zone",
		method: "wow",
		metric: "error_count",
		reach: {
			current: 22,
			previous: 8,
			unit: "visitor_identifiers",
		},
		severity: "critical",
		subjectKey: "route:error:/private-zone",
	};
	const omitted: DetectedSignal = {
		...selected,
		baseline: 2000,
		current: 4000,
		deltaPercent: 100,
		label: "Slow load on /private-zone",
		metric: "lcp",
		reach: {
			current: 80,
			previous: 60,
			unit: "samples",
		},
		severity: "warning",
		subjectKey: "route:lcp:/private-zone",
	};
	const plan: CoveragePortfolioPlan = {
		entries: [
			{
				family: "error",
				omittedFor: [],
				rank: 1,
				selectedAt: 1,
				signal: selected,
			},
			{
				family: "vital",
				omittedFor: ["same_cluster", "portfolio_limit"],
				rank: 2,
				selectedAt: null,
				signal: omitted,
			},
		],
		selected: [selected],
	};
	return {
		asOf: "2026-08-02T12:00:00.000Z",
		detectedSignals: [selected, omitted],
		dueSignalKey: null,
		eligibleSignals: [selected],
		qualifications: [
			{
				reason: "material_error_reach",
				signal: selected,
				status: "qualified",
			},
			{
				reason: "unhealthy_vital",
				signal: omitted,
				status: "qualified",
			},
		],
		plan,
		reachPlan: plan,
		status: "signals",
	};
}

describe("selection audit projection", () => {
	it("reports selection evidence without raw subjects or labels", () => {
		const projected = projectSelectionAudit({
			inspection: inventoryFixture(),
			measurementRecommendationScan: "unavailable_historical",
			siteId: "fixture-site",
		});

		expect(projected).toMatchObject({
			detectedCount: 2,
			eligibleCount: 1,
			history: "fresh_in_memory",
			measurementRecommendationScan: "unavailable_historical",
			portfolioLimit: 6,
			qualifiedCount: 2,
			qualifiedSelectedCount: 1,
			reachSelectedCount: 1,
			screenedCount: 0,
			screenedSelectedCount: 0,
			selectedCount: 1,
			status: "signals",
		});
		expect(projected.candidates).toEqual([
				expect.objectContaining({
				eligible: true,
				family: "error",
				metric: "error",
				qualification: "qualified",
				qualificationReason: "material_error_reach",
				reach: {
					current: 22,
					previous: 8,
					unit: "visitor_identifiers",
				},
				reachSelectedAt: 1,
				selectedAt: 1,
			}),
				expect.objectContaining({
				eligible: false,
				family: "vital",
				metric: "route_health",
				omittedFor: ["same_cluster", "portfolio_limit"],
				qualification: "qualified",
				qualificationReason: "unhealthy_vital",
				reachSelectedAt: null,
				selectedAt: null,
			}),
		]);
		const rendered = JSON.stringify(projected);
		expect(rendered).not.toContain("private-zone");
		expect(rendered).not.toContain("sensitive label");
	});

	it("is deterministic for a frozen candidate inventory", () => {
		const params = { inspection: inventoryFixture(), siteId: "fixture-site" };

		expect(projectSelectionAudit(params)).toEqual(projectSelectionAudit(params));
	});

	it("keeps the detector fingerprint stable when only portfolio selection changes", () => {
		const inspection = inventoryFixture();
		if (inspection.status !== "signals") {
			throw new Error("Expected a signal inventory");
		}
		const [selected, omitted] = inspection.plan.entries;
		if (!(selected && omitted)) {
			throw new Error("Expected two plan entries");
		}
		const alternativePlan: CoveragePortfolioPlan = {
			entries: [
				{ ...selected, omittedFor: ["lower_priority"], selectedAt: null },
				{ ...omitted, omittedFor: [], selectedAt: 1 },
			],
			selected: [omitted.signal],
		};
		const before = projectSelectionAudit({
			inspection,
			siteId: "fixture-site",
		});
		const after = projectSelectionAudit({
			inspection: { ...inspection, plan: alternativePlan },
			siteId: "fixture-site",
		});

		expect(after.detectedUniverseFingerprint).toBe(
			before.detectedUniverseFingerprint
		);
		expect(after.candidateUniverseFingerprint).not.toBe(
			before.candidateUniverseFingerprint
		);
	});

	it("projects clustering counts without route or error identities", () => {
		const inspection = inventoryFixture();
		if (inspection.status !== "signals") {
			throw new Error("Expected a signal inventory");
		}
		inspection.overlapClustering = {
			candidatePairCount: 2,
			independentRouteSignalKeys: ["route:error:/private-zone"],
			measuredPairCount: 2,
			passes: 2,
			redundantRouteSignalKeys: ["route:error:/covered-private-zone"],
			selectedCandidatesSettled: true,
			unavailablePairCount: 0,
		};
		const projected = projectSelectionAudit({
			inspection,
			siteId: "fixture-site",
		});

		expect(projected.overlapClustering).toEqual({
			candidatePairCount: 2,
			measuredPairCount: 2,
			passes: 2,
			retainedIndependentRouteCount: 1,
			selectedCandidatesSettled: true,
			suppressedRouteCount: 1,
			unavailablePairCount: 0,
		});
		const rendered = JSON.stringify(projected);
		expect(rendered).not.toContain("covered-private-zone");
		expect(rendered).not.toContain("private-zone");
	});

	it("projects aggregate error overlap without leaking either subject", () => {
		const route = inventoryFixture().detectedSignals[0];
		if (!route) {
			throw new Error("Expected route error fixture");
		}
		const fingerprint: DetectedSignal = {
			...route,
			entityId: "Private fingerprint",
			entityLabel: "Private fingerprint label",
			label: "Private fingerprint label",
			subjectKey: "error:Private fingerprint",
		};
		const projected = projectErrorCandidateOverlap({
			fingerprint,
			overlap: {
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
			},
			route,
			siteId: "fixture-site",
		});

		expect(projected).toMatchObject({
			cooccurring: { errorOccurrences: 14, visitorIdentifiers: 13 },
			fingerprint: { visitorIdentifiers: 36 },
			marginalRouteVisitorIdentifiers: 3,
			route: { visitorIdentifiers: 16 },
			shared: { visitorIdentifiers: 13 },
			visitorOverlapMeasurable: true,
		});
		const rendered = JSON.stringify(projected);
		expect(rendered).not.toContain("private-zone");
		expect(rendered).not.toContain("Private fingerprint");
		expect(rendered).not.toContain("sensitive label");
	});

	it("keeps the more independent warning error in the marginal audit", () => {
		const baseRoute = inventoryFixture().detectedSignals[0];
		if (!baseRoute) {
			throw new Error("Expected small route fixture");
		}
		const smallRoute: DetectedSignal = {
			...baseRoute,
			baseline: 2,
			current: 13,
			deltaPercent: 550,
			reach: {
				current: 7,
				previous: 2,
				unit: "visitor_identifiers",
			},
			severity: "warning",
			subjectKey: "route:error:/small-private-zone",
		};
		const fingerprint: DetectedSignal = {
			...smallRoute,
			baseline: 23,
			current: 38,
			deltaPercent: 65.22,
			entityId: "Private fingerprint",
			entityLabel: "Private fingerprint label",
			label: "Private fingerprint label",
			reach: {
				current: 36,
				previous: 23,
				unit: "visitor_identifiers",
			},
			severity: "critical",
			subjectKey: "error:Private fingerprint",
		};
		const largeRoute: DetectedSignal = {
			...smallRoute,
			baseline: 6,
			current: 22,
			deltaPercent: 266.67,
			entityId: "/large-private-zone",
			label: "Errors on /large-private-zone",
			reach: {
				current: 16,
				previous: 6,
				unit: "visitor_identifiers",
			},
			subjectKey: "route:error:/large-private-zone",
		};
		const fingerprintEntry: CoveragePortfolioPlan["entries"][number] = {
			family: "error",
			omittedFor: [],
			rank: 1,
			selectedAt: 1,
			signal: fingerprint,
		};
		const smallRouteEntry: CoveragePortfolioPlan["entries"][number] = {
			family: "error",
			omittedFor: [],
			rank: 2,
			selectedAt: 2,
			signal: smallRoute,
		};
		const largeRouteEntry: CoveragePortfolioPlan["entries"][number] = {
			family: "error",
			omittedFor: ["portfolio_limit"],
			rank: 3,
			selectedAt: null,
			signal: largeRoute,
		};
		const plan: CoveragePortfolioPlan = {
			entries: [fingerprintEntry, smallRouteEntry, largeRouteEntry],
			selected: [fingerprint, smallRoute],
		};
		const reachPlan: CoveragePortfolioPlan = {
			entries: [
				{ ...fingerprintEntry, selectedAt: 1 },
				{ ...smallRouteEntry, selectedAt: null },
				{ ...largeRouteEntry, omittedFor: [], selectedAt: 2 },
			],
			selected: [fingerprint, largeRoute],
		};
		const inspection: WebsitePortfolioInspection = {
			asOf: "2026-08-02T12:00:00.000Z",
			detectedSignals: [fingerprint, smallRoute, largeRoute],
			dueSignalKey: null,
			eligibleSignals: [fingerprint, smallRoute, largeRoute],
			qualifications: [
				{
					reason: "material_error_reach",
					signal: fingerprint,
					status: "qualified",
				},
				{
					reason: "observed_session_behavior",
					signal: smallRoute,
					status: "qualified",
				},
				{
					reason: "low_reach_error_without_harm",
					signal: largeRoute,
					status: "screened",
				},
			],
			plan,
			reachPlan,
			status: "signals",
		};
		const projected = projectSelectionAudit({
			errorOverlaps: [
				projectErrorCandidateOverlap({
					fingerprint,
					overlap: {
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
					route: smallRoute,
					siteId: "fixture-site",
				}),
				projectErrorCandidateOverlap({
					fingerprint,
					overlap: {
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
					},
					route: largeRoute,
					siteId: "fixture-site",
				}),
			],
			inspection,
			siteId: "fixture-site",
		});

		expect(projected.marginalRankingStatus).toBe("measured");
		expect(projected.marginalSelectedCount).toBe(2);
		const smallProjected = projected.candidates.find(
			(candidate) => candidate.current === 13
		);
		const largeProjected = projected.candidates.find(
			(candidate) => candidate.current === 22
		);
		if (!(smallProjected && largeProjected)) {
			throw new Error("Expected both route candidates in audit projection");
		}
		expect(smallProjected.marginalSelectedAt).toBe(2);
		expect(largeProjected.marginalSelectedAt).toBeNull();

		const unavailable = projectSelectionAudit({
			inspection,
			siteId: "fixture-site",
		});
		expect(unavailable.marginalRankingStatus).toBe("unavailable");
		expect(
			unavailable.candidates.find((candidate) => candidate.current === 13)
				?.marginalSelectedAt
		).toBe(2);
		expect(
			unavailable.candidates.find((candidate) => candidate.current === 22)
				?.marginalSelectedAt
		).toBeNull();
	});

	it("keeps an empty inventory explicit", () => {
		const projected = projectSelectionAudit({
			inspection: {
				asOf: "2026-08-02T12:00:00.000Z",
				detectedSignals: [],
				dueSignalKey: null,
				eligibleSignals: [],
				qualifications: [],
				plan: null,
				reachPlan: null,
				status: "no_signals",
			},
			siteId: "fixture-site",
		});

		expect(projected).toMatchObject({
			candidates: [],
			detectedCount: 0,
			eligibleCount: 0,
			selectedCount: 0,
			status: "no_signals",
		});
	});
});

describe("selection audit CLI", () => {
	it("accepts six agent slots and rejects a seventh", () => {
		const base = [
			"--confirm-read-only-production",
			"--reference-time",
			"2026-08-02T12:00:00.000Z",
		];
		expect(parseOptions([...base, "--batch-size", "6"]).batchSize).toBe(6);
		expect(() => parseOptions([...base, "--batch-size", "7"])).toThrow(
			"batch-size must be at most 6"
		);
	});

	it("requires exactly one frozen snapshot", () => {
		expect(() =>
			parseOptions([
				"--confirm-read-only-production",
				"--selection-audit",
				"--reference-time",
				"2026-08-02T12:00:00.000Z",
				"--offsets",
				"7,0",
			])
		).toThrow("selection-audit requires exactly one frozen snapshot");
	});

	it("keeps output-quality evaluation on generated outcomes", () => {
		const base = [
			"--confirm-read-only-production",
			"--reference-time",
			"2026-08-02T12:00:00.000Z",
		];
		expect(parseOptions([...base, "--quality-eval"]).qualityEvaluation).toBe(
			true
		);
		expect(() =>
			parseOptions([
				...base,
				"--offsets",
				"0",
				"--quality-eval",
				"--selection-audit",
			])
		).toThrow(
			"quality-eval requires generated investigation outcomes, not selection-audit"
		);
	});
});
