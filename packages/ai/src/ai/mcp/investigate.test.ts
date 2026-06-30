import "./tools.test-env";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	buildFallbackMemo,
	buildInvestigationBrief,
	buildInvestigationWindow,
	buildReceipts,
	type InvestigationMemo,
	investigationMemoSchema,
	renderMemoMarkdown,
} from "./investigate";
import type { McpAgentToolTrace } from "./run-agent";

const sampleTrace: McpAgentToolTrace[] = [
	{
		index: 0,
		name: "get_data",
		input: { websiteId: "site_1", queries: [{ type: "events_by_date" }] },
		output: { batch: true, results: [{ type: "events_by_date", rowCount: 30 }] },
	},
	{
		index: 1,
		name: "get_data",
		input: { websiteId: "site_1", queries: [{ type: "top_pages" }] },
		output: { batch: true, results: [{ type: "top_pages", rowCount: 10 }] },
	},
	{
		index: 2,
		name: "list_recent_commits",
		input: { since: "2026-06-01" },
		output: [{ sha: "d4f21a9" }],
	},
];

const sampleMemo: InvestigationMemo = {
	headline: "Checkout errors up 412% after deploy d4f21a9",
	narrative: "Errors on /checkout jumped from 12/day to 61/day on June 8.",
	causalChain: [
		{
			step: "Deploy d4f21a9 landed June 8 14:02 UTC",
			evidence: "commit list shows d4f21a9 merged 14 minutes before error onset",
		},
		{
			step: "TypeError spike began 14:16 UTC on /checkout",
			evidence: "error count went 12 -> 61/day, all one error class",
		},
	],
	deadEnds: [
		{
			hypothesis: "Traffic mix shift caused the error increase",
			ruledOutBecause: "referrer and device distribution unchanged week-over-week",
		},
	],
	confidence: { level: "high", reason: "cause, mechanism, and timing all align" },
	verdict: {
		type: "act",
		reason: "deploy d4f21a9 is rollbackable and errors are still climbing",
	},
	actions: ["Roll back or patch d4f21a9"],
};

describe("buildReceipts", () => {
	test("maps every tool call and dedupes sources", () => {
		const receipts = buildReceipts(5, sampleTrace);
		expect(receipts.steps).toBe(5);
		expect(receipts.queriesRun).toHaveLength(3);
		expect(receipts.sourcesChecked).toEqual(["get_data", "list_recent_commits"]);
	});

	test("truncates oversized inputs", () => {
		const receipts = buildReceipts(1, [
			{ index: 0, name: "get_data", input: { sql: "x".repeat(5000) }, output: null },
		]);
		expect(receipts.queriesRun[0]?.input.length).toBeLessThanOrEqual(300);
	});

	test("handles empty trace", () => {
		const receipts = buildReceipts(0, []);
		expect(receipts.queriesRun).toEqual([]);
		expect(receipts.sourcesChecked).toEqual([]);
	});
});

describe("buildInvestigationBrief", () => {
	test("includes website, lookback, and protocol phases", () => {
		const brief = buildInvestigationBrief({
			websiteId: "site_1",
			websiteDomain: "example.com",
			lookbackDays: 30,
		});
		expect(brief).toContain("site_1");
		expect(brief).toContain("example.com");
		expect(brief).toContain("30-day");
		expect(brief).toContain("1. Sweep");
		expect(brief).toContain("2. Baseline health");
		expect(brief).toContain("4. Correlate");
		expect(brief).toContain("most consequential change");
	});

	test("pins exact equal-length comparison windows", () => {
		const brief = buildInvestigationBrief({
			websiteId: "site_1",
			websiteDomain: "example.com",
			lookbackDays: 14,
			now: new Date("2026-06-12T15:00:00Z"),
		});
		expect(brief).toContain("2026-05-30 to 2026-06-12");
		expect(brief).toContain(
			"2026-05-30 to 2026-06-05 vs 2026-06-06 to 2026-06-12 (7 days each)"
		);
	});

	test("anchors on the user question when given", () => {
		const brief = buildInvestigationBrief({
			websiteId: "site_1",
			websiteDomain: "example.com",
			lookbackDays: 14,
			question: "why did signups drop?",
		});
		expect(brief).toContain("why did signups drop?");
		expect(brief).not.toContain("most consequential change");
	});
});

describe("buildInvestigationWindow", () => {
	test("drops the oldest day for odd lookbacks so halves stay equal", () => {
		const window = buildInvestigationWindow(
			15,
			new Date("2026-06-12T15:00:00Z")
		);
		expect(window.from).toBe("2026-05-29");
		expect(window.to).toBe("2026-06-12");
		expect(window.halves).toBe(
			"2026-05-30 to 2026-06-05 vs 2026-06-06 to 2026-06-12 (7 days each)"
		);
	});
});

describe("renderMemoMarkdown", () => {
	test("renders all sections with receipts", () => {
		const receipts = buildReceipts(5, sampleTrace);
		const markdown = renderMemoMarkdown(sampleMemo, receipts);
		expect(markdown).toContain("# Checkout errors up 412%");
		expect(markdown).toContain("## Causal chain");
		expect(markdown).toContain("evidence: commit list shows d4f21a9");
		expect(markdown).toContain("## Ruled out");
		expect(markdown).toContain("## Confidence: high");
		expect(markdown).toContain("## Do next");
		expect(markdown).toContain("5 agent steps, 3 tool calls");
	});

	test("omits empty causal chain, dead ends, and actions", () => {
		const emptyMemo: InvestigationMemo = {
			...sampleMemo,
			causalChain: [],
			deadEnds: [],
			actions: [],
			confidence: {
				level: "low",
				reason: "no inflection point found in the window",
			},
		};
		const markdown = renderMemoMarkdown(emptyMemo, buildReceipts(2, []));
		expect(markdown).not.toContain("## Causal chain");
		expect(markdown).not.toContain("## Ruled out");
		expect(markdown).not.toContain("## Do next");
		expect(markdown).toContain("## Confidence: low");
	});

	test("labels act verdict and includes the reason", () => {
		const markdown = renderMemoMarkdown(sampleMemo, buildReceipts(2, []));
		expect(markdown).toContain(
			"**Act now.** deploy d4f21a9 is rollbackable and errors are still climbing"
		);
	});

	test("labels watch verdict", () => {
		const watchMemo: InvestigationMemo = {
			...sampleMemo,
			verdict: { type: "watch", reason: "cause unconfirmed, trend worsening" },
		};
		const markdown = renderMemoMarkdown(watchMemo, buildReceipts(2, []));
		expect(markdown).toContain(
			"**Watch.** cause unconfirmed, trend worsening"
		);
	});

	test("renders compact output for all_clear without full sections", () => {
		const allClearMemo: InvestigationMemo = {
			...sampleMemo,
			verdict: {
				type: "all_clear",
				reason: "viral spike normalized, nothing is broken",
			},
			actions: ["Recheck direct traffic next week"],
		};
		const markdown = renderMemoMarkdown(allClearMemo, buildReceipts(5, sampleTrace));
		expect(markdown).toContain(
			"**All clear.** viral spike normalized, nothing is broken"
		);
		expect(markdown).toContain("Monitor: Recheck direct traffic next week");
		expect(markdown).toContain("5 agent steps, 3 tool calls");
		expect(markdown).not.toContain("## Causal chain");
		expect(markdown).not.toContain("## Confidence");
		expect(markdown).not.toContain("## Do next");
	});

	test("all_clear without actions omits the monitor line", () => {
		const allClearMemo: InvestigationMemo = {
			...sampleMemo,
			verdict: { type: "all_clear", reason: "change is within normal variance" },
			actions: [],
		};
		const markdown = renderMemoMarkdown(allClearMemo, buildReceipts(2, []));
		expect(markdown).not.toContain("Monitor:");
	});
});

describe("buildFallbackMemo", () => {
	test("preserves the agent answer as a valid low-confidence memo", () => {
		const memo = buildFallbackMemo("Pageviews fell 30% on /pricing after June 8.");
		expect(investigationMemoSchema.safeParse(memo).success).toBe(true);
		expect(memo.narrative).toContain("/pricing");
		expect(memo.confidence.level).toBe("low");
		expect(memo.verdict.type).toBe("watch");
	});

	test("stays valid and renders when the answer is empty", () => {
		const memo = buildFallbackMemo("   ");
		expect(investigationMemoSchema.safeParse(memo).success).toBe(true);
		const markdown = renderMemoMarkdown(memo, buildReceipts(7, sampleTrace));
		expect(markdown).toContain("## Confidence: low");
		expect(markdown).toContain("7 agent steps, 3 tool calls");
	});
});

describe("investigationMemoSchema", () => {
	test("accepts a complete memo", () => {
		expect(investigationMemoSchema.safeParse(sampleMemo).success).toBe(true);
	});

	test("rejects unknown confidence levels", () => {
		const bad = {
			...sampleMemo,
			confidence: { level: "certain", reason: "x" },
		};
		expect(investigationMemoSchema.safeParse(bad).success).toBe(false);
	});

	test("renders to JSON Schema for MCP output", () => {
		expect(() =>
			z.toJSONSchema(investigationMemoSchema, { io: "output" })
		).not.toThrow();
	});
});
