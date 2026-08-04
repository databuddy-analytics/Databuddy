import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	classifyErrorCandidateOverlap,
	clusterErrorCandidateRoutes,
	loadErrorCandidateOverlap,
	parseErrorCandidateOverlap,
} from "./error-candidate-overlap";

const period = {
	current: { from: "2026-07-26", to: "2026-08-01" },
	previous: { from: "2026-07-19", to: "2026-07-25" },
};

const fingerprint: InvestigationSignal = {
	changePercent: 65.2,
	entity: {
		id: "A fingerprint that must not appear in audit output",
		label: "Fingerprint",
		type: "error",
	},
	metric: {
		current: 38,
		format: "number",
		label: "Errors",
		previous: 23,
	},
	period,
	sentiment: "negative",
	severity: "critical",
	signalKey: "error:opaque-fingerprint",
};

const route: InvestigationSignal = {
	...fingerprint,
	entity: { id: "/opaque-route", label: "Route", type: "page" },
	metric: { ...fingerprint.metric, current: 22, previous: 6 },
	severity: "warning",
	signalKey: "route:error:/opaque-route",
};

const row = {
	cooccurring_error_occurrences: 14,
	cooccurring_sessions: 13,
	cooccurring_visitor_identifiers: 13,
	fingerprint_error_occurrences: 38,
	fingerprint_sessions: 36,
	fingerprint_visitor_identifiers: 36,
	route_error_occurrences: 22,
	route_sessions: 16,
	route_visitor_identifiers: 16,
	session_overlap_measurable: 1,
	shared_sessions: 13,
	shared_visitor_identifiers: 13,
	visitor_overlap_measurable: 1,
};

function detectedError(
	overrides: Partial<DetectedSignal> & Pick<DetectedSignal, "subjectKey">
): DetectedSignal {
	return {
		baseline: 23,
		current: 38,
		deltaPercent: 65.2,
		detectedAt: "2026-08-01",
		direction: "up",
		entityId: "opaque-fingerprint",
		entityLabel: "Opaque fingerprint",
		label: "Error count",
		method: "wow",
		metric: "error_count",
		reach: {
			current: 36,
			previous: 23,
			unit: "visitor_identifiers",
		},
		severity: "critical",
		...overrides,
	};
}

const fingerprintCandidate = detectedError({
	subjectKey: "error:opaque-fingerprint",
});
const redundantRouteCandidate = detectedError({
	baseline: 6,
	current: 22,
	deltaPercent: 266.67,
	entityId: "/opaque-route",
	entityLabel: "Opaque route",
	reach: { current: 16, previous: 6, unit: "visitor_identifiers" },
	severity: "warning",
	subjectKey: "route:error:/opaque-route",
});
const independentRouteCandidate = detectedError({
	baseline: 2,
	current: 13,
	deltaPercent: 550,
	entityId: "/independent-route",
	entityLabel: "Independent route",
	reach: { current: 7, previous: 2, unit: "visitor_identifiers" },
	severity: "warning",
	subjectKey: "route:error:/independent-route",
});

function overlapForRoute(
	route: DetectedSignal,
	overrides: Partial<typeof row>
) {
	return parseErrorCandidateOverlap({
		...row,
		route_error_occurrences: route.current,
		route_sessions: route.reach?.current ?? 0,
		route_visitor_identifiers: route.reach?.current ?? 0,
		...overrides,
	});
}

describe("error candidate overlap", () => {
	it("parses only consistent aggregate cohort cardinalities", () => {
		const overlap = parseErrorCandidateOverlap(row);

		expect(overlap).toEqual({
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
		});
		expect(() =>
			parseErrorCandidateOverlap({
				...row,
				shared_visitor_identifiers: 17,
			})
		).toThrow("Inconsistent error candidate overlap visitor identifiers");
		expect(() =>
			parseErrorCandidateOverlap({
				...row,
				visitor_overlap_measurable: 0,
			})
		).toThrow("Inconsistent error candidate visitor overlap coverage");
	});

	it("keeps full cohort overlap distinct from directly cooccurring error rows", () => {
		const overlap = parseErrorCandidateOverlap({
			...row,
			cooccurring_error_occurrences: 1,
			cooccurring_sessions: 1,
			cooccurring_visitor_identifiers: 1,
		});

		expect(overlap).toMatchObject({
			cooccurring: { visitorIdentifiers: 1 },
			shared: { visitorIdentifiers: 13 },
		});
	});

	it("binds exactly one fingerprint and route over their shared current window", async () => {
		const calls: unknown[] = [];
		const overlap = await loadErrorCandidateOverlap(
			{ fingerprint, route, timezone: "UTC", websiteId: "site-1" },
			async (request) => {
				calls.push(request);
				return [row];
			}
		);

		expect(overlap?.shared.visitorIdentifiers).toBe(13);
		expect(calls).toEqual([
			{
				filters: [
					{
						field: "message",
						op: "eq",
						value: "A fingerprint that must not appear in audit output",
					},
					{ field: "path", op: "eq", value: "/opaque-route" },
				],
				from: "2026-07-26",
				projectId: "site-1",
				to: "2026-08-01",
				timezone: "UTC",
				type: "error_candidate_overlap",
			},
		]);
	});

	it("does not infer zero overlap from mismatched windows or non-error signals", async () => {
		let calls = 0;
		const query = async () => {
			calls += 1;
			return [row];
		};

		await expect(
			loadErrorCandidateOverlap(
				{
					fingerprint,
					route: {
						...route,
						period: {
							...period,
							current: { from: "2026-07-25", to: "2026-07-31" },
						},
					},
					timezone: "UTC",
					websiteId: "site-1",
				},
				query
			)
		).resolves.toBeNull();
		await expect(
			loadErrorCandidateOverlap(
				{
					fingerprint: { ...fingerprint, signalKey: "route:lcp:/opaque-route" },
					route,
					timezone: "UTC",
					websiteId: "site-1",
				},
				query
			)
		).resolves.toBeNull();
		expect(calls).toBe(0);
	});

	it("classifies only a high-overlap route with little incremental exposure as redundant", () => {
		const redundant = overlapForRoute(redundantRouteCandidate, {});
		const independent = overlapForRoute(independentRouteCandidate, {
			cooccurring_error_occurrences: 1,
			cooccurring_sessions: 1,
			cooccurring_visitor_identifiers: 1,
			shared_sessions: 1,
			shared_visitor_identifiers: 1,
		});
		if (!(redundant && independent)) {
			throw new Error("Expected comparable overlap fixtures");
		}

		expect(
			classifyErrorCandidateOverlap({
				fingerprint: fingerprintCandidate,
				overlap: redundant,
				route: redundantRouteCandidate,
			})
		).toBe("redundant");
		expect(
			classifyErrorCandidateOverlap({
				fingerprint: fingerprintCandidate,
				overlap: independent,
				route: independentRouteCandidate,
			})
		).toBe("independent");
		expect(
			classifyErrorCandidateOverlap({
				fingerprint: { ...fingerprintCandidate, current: 37 },
				overlap: redundant,
				route: redundantRouteCandidate,
			})
		).toBe("unavailable");
	});

	it("suppresses only the measured redundant route and retains a due route", async () => {
		const cluster = await clusterErrorCandidateRoutes({
			candidates: [
				fingerprintCandidate,
				independentRouteCandidate,
				redundantRouteCandidate,
			],
			loadOverlap: async ({ route: candidate }) => {
				if (candidate.signalKey === redundantRouteCandidate.subjectKey) {
					return overlapForRoute(redundantRouteCandidate, {});
				}
				return overlapForRoute(independentRouteCandidate, {
					cooccurring_error_occurrences: 1,
					cooccurring_sessions: 1,
					cooccurring_visitor_identifiers: 1,
					shared_sessions: 1,
					shared_visitor_identifiers: 1,
				});
			},
			lookbackDays: 7,
			timezone: "UTC",
			websiteId: "site-1",
		});

		expect(cluster).toMatchObject({
			candidatePairCount: 2,
			independentRouteSignalKeys: [independentRouteCandidate.subjectKey],
			measuredPairCount: 2,
			redundantRouteSignalKeys: [redundantRouteCandidate.subjectKey],
			unavailablePairCount: 0,
		});
		expect(cluster.redundantRouteReceipts).toEqual([
			{
				fingerprintSignalKey: fingerprintCandidate.subjectKey,
				route: {
					changePercent: redundantRouteCandidate.deltaPercent,
					entity: {
						id: redundantRouteCandidate.entityId,
						label: redundantRouteCandidate.entityLabel,
						type: "page",
					},
					metric: {
						current: redundantRouteCandidate.current,
						format: "number",
						label: redundantRouteCandidate.label,
						previous: redundantRouteCandidate.baseline,
					},
					period,
					sentiment: "negative",
					severity: redundantRouteCandidate.severity,
					signalKey: redundantRouteCandidate.subjectKey,
				},
				routeSignalKey: redundantRouteCandidate.subjectKey,
			},
		]);

		const dueCluster = await clusterErrorCandidateRoutes({
			candidates: [fingerprintCandidate, redundantRouteCandidate],
			dueSignalKey: redundantRouteCandidate.subjectKey,
			loadOverlap: async () => {
				throw new Error("A due route must not be measured for suppression");
			},
			lookbackDays: 7,
			timezone: "UTC",
			websiteId: "site-1",
		});
		expect(dueCluster).toMatchObject({
			candidatePairCount: 0,
			independentRouteSignalKeys: [],
			measuredPairCount: 0,
			redundantRouteSignalKeys: [],
			unavailablePairCount: 0,
		});
		expect(dueCluster.redundantRouteReceipts).toEqual([]);
	});

	it("fails open when an overlap query cannot be measured", async () => {
		const cluster = await clusterErrorCandidateRoutes({
			candidates: [fingerprintCandidate, redundantRouteCandidate],
			loadOverlap: async () => {
				throw new Error("Warehouse timeout");
			},
			lookbackDays: 7,
			timezone: "UTC",
			websiteId: "site-1",
		});

		expect(cluster).toMatchObject({
			candidatePairCount: 1,
			independentRouteSignalKeys: [],
			measuredPairCount: 0,
			redundantRouteSignalKeys: [],
			unavailablePairCount: 1,
		});
		expect(cluster.redundantRouteReceipts).toEqual([]);
	});
});
