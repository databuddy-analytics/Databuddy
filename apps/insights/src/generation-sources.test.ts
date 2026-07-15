import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationEvidence } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import { materializeAgentDecision } from "./agent";
import {
	type InvestigationSources,
	investigateWebsiteWithSources,
	resolveInvestigationAsOf,
} from "./generation";

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

const revenueDrop: DetectedSignal = {
	...trafficDrop,
	baseline: 1000,
	current: 400,
	deltaPercent: -60,
	label: "Revenue",
	metric: "revenue",
};

describe("fixture investigation sources", () => {
	it("resolves a date-only run to one exact instant in the website timezone", () => {
		expect(resolveInvestigationAsOf("2026-07-12", "Asia/Hebron")).toEqual(
			new Date("2026-07-11T21:00:00.000Z")
		);
	});

	it("runs the production investigation path using only required sources", async () => {
		const calls: string[] = [];
		const sources: InvestigationSources = {
			hasTrackedData: async () => {
				calls.push("preflight");
				return true;
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop, revenueDrop];
			},
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
			fetchAnnotations: async () => {
				calls.push("annotations");
				return [];
			},
			createEvidenceReader: async (params) => {
				calls.push("evidence reader");
				return async (request) => {
					calls.push(`evidence:${request.name}`);
					const evidence: InvestigationEvidence = {
						evidenceId: "fixture:top-referrers",
						signalKey: params.signal.signalKey,
						kind: "breakdown",
						source: "web",
						queryType: "top_referrers",
						period: "current",
						range: params.signal.period.current,
						status: "ok",
						rowCount: 1,
						summary: "Organic search accounted for most of the visitor decline.",
					};
					return [evidence];
				};
			},
			createServiceAuth: async () => {
				calls.push("service auth");
				return undefined;
			},
			investigateSignal: async (input) => {
				calls.push(`agent:${input.candidates.length}`);
				const candidate = input.candidates.find(
					(item) => item.signal.signalKey === "visitors"
				);
				if (!candidate) {
					throw new Error("Expected one fixture candidate");
				}
				const queried = await input.readEvidence(
					candidate.signal,
					{
						name: "web_metrics",
						input: {
							period: "current",
							queries: [{ type: "top_referrers" }],
						},
					},
					input.appContext
				);
				const evidence = [...queried, ...candidate.evidence];
				return {
					...materializeAgentDecision({
						decision: {
							disposition: "needs_context",
							title: "Organic search traffic fell",
							evidenceIds: ["fixture:top-referrers"],
							confidence: 0.8,
							question: "Did search traffic or tracking change intentionally?",
						},
						evidence,
						queriedEvidenceIds: new Set(
							queried.map((item) => item.evidenceId)
						),
						signal: candidate.signal,
					}),
					evidence,
					signal: candidate.signal,
					toolCallCount: 1,
				};
			},
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact).toMatchObject({
			decision: { disposition: "needs_context" },
			detectionComplete: true,
			status: "completed",
		});
		expect(artifact.insight?.title).toBe("Organic search traffic fell");
		expect(artifact.signal?.signalKey).toBe("visitors");
		expect(calls.sort()).toEqual(
			[
				"agent:2",
				"annotations",
				"annotations",
				"definition detection",
				"evidence reader",
				"evidence:web_metrics",
				"metric detection",
				"observations",
				"preflight",
				"service auth",
			].sort()
		);
	});

	it("does not fall through to downstream production reads after fixture preflight", async () => {
		const forbidden = () => {
			throw new Error("downstream source should not run");
		};
		const sources: InvestigationSources = {
			createEvidenceReader: forbidden,
			createServiceAuth: forbidden,
			detectDefinitionSignals: forbidden,
			detectMetricSignals: forbidden,
			fetchAnnotations: forbidden,
			hasTrackedData: async () => false,
			investigateSignal: forbidden,
			loadObservations: forbidden,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact.status).toBe("no_data");
		expect(artifact.detectedSignals).toEqual([]);
	});

	it("defers an incomplete scan without retrying or reading evidence", async () => {
		const calls: string[] = [];
		const forbidden = () => {
			throw new Error("incomplete scan should stop before downstream reads");
		};
		const sources: InvestigationSources = {
			createEvidenceReader: forbidden,
			createServiceAuth: forbidden,
			detectDefinitionSignals: async (_params, _today, _deps, options) => {
				calls.push("definition detection");
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
			fetchAnnotations: forbidden,
			hasTrackedData: async () => true,
			investigateSignal: forbidden,
			loadObservations: forbidden,
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources
		);

		expect(artifact).toMatchObject({
			decision: null,
			detectionComplete: false,
			detectedSignals: [],
			insight: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("checks agent access only after deterministic detection", async () => {
		const calls: string[] = [];
		const forbidden = () => {
			throw new Error("agent access denial should stop downstream reads");
		};
		const sources: InvestigationSources = {
			createEvidenceReader: forbidden,
			createServiceAuth: forbidden,
			detectDefinitionSignals: async () => {
				calls.push("definition detection");
				return [];
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop];
			},
			fetchAnnotations: forbidden,
			hasTrackedData: async () => {
				calls.push("preflight");
				return true;
			},
			investigateSignal: forbidden,
			loadObservations: async () => {
				calls.push("observations");
				return new Map();
			},
		};

		const artifact = await investigateWebsiteWithSources(
			{
				asOf: "2026-07-12",
				domain: "example.com",
				organizationId: "fixture-org",
				timezone: "UTC",
				websiteId: "fixture-site",
			},
			sources,
			async () => {
				calls.push("agent access");
				return false;
			}
		);

		expect(artifact).toMatchObject({
			decision: null,
			detectionComplete: true,
			detectedSignals: [trafficDrop],
			insight: null,
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			[
				"agent access",
				"definition detection",
				"metric detection",
				"observations",
				"preflight",
			].sort()
		);
	});
});
