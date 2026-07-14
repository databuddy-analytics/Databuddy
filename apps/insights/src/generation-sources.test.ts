import { describe, expect, it } from "bun:test";
import type { InvestigationEvidence } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	type InvestigationSources,
	investigateWebsiteWithSources,
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

describe("fixture investigation sources", () => {
	it("runs the production investigation path using only required sources", async () => {
		const calls: string[] = [];
		const sources: InvestigationSources = {
			hasTrackedData: async () => {
				calls.push("preflight");
				return true;
			},
			detectMetricSignals: async () => {
				calls.push("metric detection");
				return [trafficDrop];
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
			engineId: "deterministic/v1",
			status: "completed",
		});
		expect(artifact.insight?.title).toBe("Visitors drop needs context");
		expect(calls.sort()).toEqual(
			[
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
});
