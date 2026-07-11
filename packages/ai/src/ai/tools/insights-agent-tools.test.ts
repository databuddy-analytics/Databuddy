import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualQuery from "../../query";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";

type WebQueryMode = "changed" | "failed" | "large" | "normal";

let queryCalls = 0;
let webQueryMode: WebQueryMode = "normal";

mock.module("../../query", () => ({
	...actualQuery,
	executeQuery: async (request: { type: string }) => {
		queryCalls += 1;
		if (webQueryMode === "failed") {
			throw new Error("warehouse unavailable");
		}
		if (webQueryMode === "large") {
			return [{ message: "x".repeat(60_000) }];
		}
		if (webQueryMode === "changed") {
			return [{ sessions: 121 }];
		}
		if (request.type === "top_pages") {
			return [];
		}
		return [{ sessions: 120 }];
	},
}));

const { countEvidenceRows, createInsightsAgentTools } = await import(
	"./insights-agent-tools"
);

interface EvidenceOutput {
	evidence: InvestigationEvidence[];
}

interface ExecutableTool {
	execute?: (input: unknown, options: unknown) => unknown;
}

const signal: InvestigationSignal = {
	signalKey: "website:traffic",
	websiteId: "site_example",
	kind: "change",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Traffic" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 80,
		previous: 120,
		format: "number",
	},
	changePercent: -33.33,
	direction: "down",
	severity: "warning",
	sentiment: "negative",
	priority: 7,
	period: {
		current: { from: "2026-07-01", to: "2026-07-07" },
		previous: { from: "2026-06-24", to: "2026-06-30" },
	},
	detectedAt: "2026-07-07",
	detection: {
		method: "period_comparison",
		reason: "Visitors fell from the previous period.",
	},
};

async function executeTool(
	tool: unknown,
	input: Record<string, unknown>
): Promise<EvidenceOutput> {
	const execute = (tool as ExecutableTool).execute;
	if (!execute) {
		throw new Error("Expected an executable tool");
	}
	return (await execute(input, {})) as EvidenceOutput;
}

function createTools(
	onEvidence?: (evidence: InvestigationEvidence) => void,
	signals: InvestigationSignal[] = [signal]
) {
	return createInsightsAgentTools({
		domain: "example.com",
		onEvidence,
		signals,
		timezone: "UTC",
		websiteId: "site_example",
	}).tools;
}

describe("insights agent query evidence", () => {
	beforeEach(() => {
		queryCalls = 0;
		webQueryMode = "normal";
	});

	afterAll(() => {
		mock.module("../../query", () => actualQuery);
	});

	test("returns stable, signal-scoped success and empty evidence", async () => {
		const observed: InvestigationEvidence[] = [];
		const tools = createTools((evidence) => observed.push(evidence));
		const input = {
			period: "current",
			queries: [{ type: "summary_metrics" }, { type: "top_pages" }],
			signalKey: "website:traffic",
		};

		const first = await executeTool(tools.web_metrics, input);
		const second = await executeTool(tools.web_metrics, input);

		expect(first.evidence).toHaveLength(2);
		expect(first.evidence[0]).toMatchObject({
			kind: "trend",
			period: "current",
			queryType: "summary_metrics",
			range: { from: "2026-07-01", to: "2026-07-07" },
			rowCount: 1,
			signalKey: "website:traffic",
			source: "web",
			status: "ok",
		});
		expect(first.evidence[1]).toMatchObject({
			kind: "breakdown",
			queryType: "top_pages",
			rowCount: 0,
			status: "empty",
		});
		expect(second.evidence.map((item) => item.evidenceId)).toEqual(
			first.evidence.map((item) => item.evidenceId)
		);
		expect(first.evidence[0]?.evidenceId).toMatch(/^evidence:web:[a-f0-9]{16}$/);
		expect(observed).toHaveLength(4);
		expect(observed).toEqual([...first.evidence, ...second.evidence]);

		webQueryMode = "changed";
		const changed = await executeTool(tools.web_metrics, input);
		expect(changed.evidence[0].evidenceId).not.toBe(
			first.evidence[0].evidenceId
		);
	});

	test("reports query failures instead of treating them as empty data", async () => {
		webQueryMode = "failed";
		const tools = createTools();

		const result = await executeTool(tools.web_metrics, {
			period: "previous",
			queries: [{ type: "summary_metrics" }],
			signalKey: "website:traffic",
		});

		expect(result.evidence[0]).toMatchObject({
			error: "warehouse unavailable",
			period: "previous",
			rowCount: 0,
			status: "failed",
		});
	});

	test("does not treat empty result collections as populated evidence", () => {
		expect(countEvidenceRows({ count: 0, goals: [] })).toBe(0);
		expect(countEvidenceRows({ note: "No matches", results: [] })).toBe(0);
		expect(countEvidenceRows({ count: 1, goals: [{ id: "goal-1" }] })).toBe(1);
		expect(countEvidenceRows({ total: 12 })).toBe(1);
	});

	test("does not aggregate sparse z-score baselines as continuous periods", async () => {
		const zscoreSignal: InvestigationSignal = {
			...signal,
			detection: {
				method: "zscore",
				reason: "Traffic differs from comparable weekdays.",
				baselineDates: [
					"2026-06-24",
					"2026-06-25",
					"2026-06-26",
					"2026-06-27",
					"2026-06-28",
					"2026-06-30",
				],
			},
		};
		const tools = createTools(undefined, [zscoreSignal]);

		await expect(
			executeTool(tools.web_metrics, {
				period: "both",
				queries: [{ type: "summary_metrics" }],
				signalKey: zscoreSignal.signalKey,
			})
		).rejects.toThrow("sparse comparable-day baseline");
		expect(queryCalls).toBe(0);
	});

	test("rejects evidence for a signal outside the investigation", async () => {
		const tools = createTools();

		await expect(
			executeTool(tools.web_metrics, {
				period: "current",
				queries: [{ type: "summary_metrics" }],
				signalKey: "website:unknown",
			})
		).rejects.toThrow("Missing period bounds for signal");
		expect(queryCalls).toBe(0);
	});

	test("rejects product definitions unrelated to the signal entity", async () => {
		const tools = createTools();

		await expect(
			executeTool(tools.product_metrics, {
				period: "current",
				signalKey: signal.signalKey,
			})
		).rejects.toThrow("Product evidence is not scoped to the website signal");
	});

	test("clips oversized data without corrupting the evidence envelope", async () => {
		webQueryMode = "large";
		const tools = createTools();

		const result = await executeTool(tools.web_metrics, {
			period: "current",
			queries: [{ type: "summary_metrics" }],
			signalKey: "website:traffic",
		});

		expect(result.evidence[0]).toMatchObject({
			rowCount: 1,
			status: "truncated",
			truncationReason:
				"The query result exceeded the evidence summary limit.",
		});
		expect(result.evidence[0].summary.length).toBeLessThanOrEqual(500);
	});

	test("classifies revenue evidence as measured business impact", async () => {
		const tools = createTools();
		const result = await executeTool(tools.web_metrics, {
			period: "current",
			queries: [{ type: "revenue_overview" }],
			signalKey: "website:traffic",
		});

		expect(result.evidence[0]).toMatchObject({
			kind: "impact",
			source: "business",
			status: "ok",
		});
	});
});
