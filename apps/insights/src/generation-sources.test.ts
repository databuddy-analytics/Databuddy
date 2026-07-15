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

const confirmedGoalDrop: DetectedSignal = {
	baseline: 20,
	current: 0,
	definitionEvidence: {
		metrics: [
			{ label: "Entrants", current: 100, format: "number" },
			{ label: "Completions", current: 0, previous: 20, format: "number" },
		],
		queryType: "goals_summary",
		summary: "Signup had 0 completions from 100 eligible visitors.",
	},
	definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
	deltaPercent: -100,
	detectedAt: "2026-07-11",
	direction: "down",
	entityLabel: "Signup",
	expectation: {
		confirmation: {
			count: 12,
			definitionId: "signup",
			definitionType: "goal",
			source: "revenue_transactions",
		},
		currentCompletions: 0,
		currentEntrants: 100,
		definitionUpdatedAt: "2026-06-01T00:00:00.000Z",
		eventName: "sign_up",
		instruction: 'Restore the "sign_up" event when Signup completes.',
		kind: "tracking",
		previousCompletions: 20,
	},
	kind: "missing_expected_data",
	label: "Signup completion rate",
	method: "wow",
	metric: "goal:signup",
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
		expect(artifact.insight?.title).toBe("Visitors fell 70%");
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

	it("fails closed when a confirmed repair is not verified by the final definition read", async () => {
		const calls: string[] = [];
		const sources: InvestigationSources = {
			hasTrackedData: async () => true,
			detectMetricSignals: async () => [],
			detectDefinitionSignals: async () => [confirmedGoalDrop],
			loadObservations: async () => new Map(),
			fetchAnnotations: async () => [],
			createEvidenceReader: async (params) => {
				calls.push("evidence reader");
				return async () => [
					{
						evidenceId: "fixture:goal:stale-definition",
						signalKey: params.signal.signalKey,
						kind: "definition",
						source: "product",
						queryType: "goals_summary",
						entity: params.signal.entity,
						period: "current",
						range: params.signal.period.current,
						status: "ok",
						rowCount: 1,
						summary: "Signup no longer matches the detected definition.",
					},
				];
			},
			createServiceAuth: async () => undefined,
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

		expect(calls).toEqual(["evidence reader"]);
		expect(artifact.decision).toEqual({
			disposition: "needs_context",
			gap: "expected_behavior",
		});
		expect(artifact.insight).not.toHaveProperty("remediationKind");
		expect(artifact.evidence.every((item) => !item.remediation)).toBe(true);
	});

	it("carries bounded validation errors on an invalid evaluation artifact", async () => {
		const sources: InvestigationSources = {
			hasTrackedData: async () => true,
			detectMetricSignals: async () => [trafficDrop],
			detectDefinitionSignals: async () => [],
			loadObservations: async () => new Map(),
			fetchAnnotations: async () => [],
			createEvidenceReader: async (params) => async () => [
				{
					evidenceId: "fixture:failed-query",
					signalKey: params.signal.signalKey,
					kind: "breakdown",
					source: "web",
					queryType: "top_referrers",
					period: "current",
					range: params.signal.period.current,
					status: "failed",
					rowCount: 0,
					error: "Warehouse unavailable",
				},
			],
			createServiceAuth: async () => undefined,
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

		expect(artifact.status).toBe("invalid_output");
		expect(artifact.validationErrors).toContain(
			"A failed Databuddy query must be retried, not turned into a terminal decision."
		);
		expect(artifact.validationErrors?.length).toBeLessThanOrEqual(5);
		expect(
			artifact.validationErrors?.every((error) => error.length <= 300)
		).toBe(true);
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
			recoveryCoverage: {
				definitionFailureMessages: [],
				failedDefinitions: 0,
				failedMetricFamilies: 1,
				rotatedDefinitions: 0,
			},
			signal: null,
			status: "deferred",
		});
		expect(calls.sort()).toEqual(
			["definition detection", "metric detection"].sort()
		);
	});

	it("does not claim complete definition coverage after an active definition edit", async () => {
		const forbidden = () => {
			throw new Error("incomplete scan should stop before downstream reads");
		};
		const sources: InvestigationSources = {
			createEvidenceReader: forbidden,
			createServiceAuth: forbidden,
			detectDefinitionSignals: async (_params, _today, _deps, options) => {
				options?.diagnostics?.activeDefinitionKeys?.add("goal:edited");
				return [];
			},
			detectMetricSignals: async () => [],
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
			detectionComplete: false,
			recoveryCoverage: {
				activeDefinitionKeys: ["goal:edited"],
				definitionFailureMessages: [],
				definitions: false,
				eligibleDefinitionKeys: [],
				failedDefinitions: 0,
				failedMetricFamilies: 0,
				rotatedDefinitions: 0,
			},
			status: "deferred",
		});
	});
});
