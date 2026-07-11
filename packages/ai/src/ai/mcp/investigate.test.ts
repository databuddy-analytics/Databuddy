import "./tools.test-env";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	buildFallbackMemo,
	buildInvestigationWindow,
	buildReceipts,
	type InvestigationMemo,
	type InvestigationReceipts,
	investigationMemoSchema,
	renderMemoMarkdown,
} from "./investigate";

const receiptParams = {
	lookbackDays: 14,
	now: new Date("2026-06-12T15:00:00Z"),
	timezone: "UTC",
	websiteId: "site_1",
};

const sampleMemo: InvestigationMemo = {
	headline: "Checkout errors rose from 12 to 61 per day",
	narrative:
		"Errors increased in the second window and were concentrated on /checkout. The fixed analytics sweep does not establish the cause.",
	causalChain: [
		{
			step: "Checkout error volume increased on June 8",
			evidence: "daily errors rose from 12 to 61",
		},
	],
	deadEnds: [
		{
			hypothesis: "A broad traffic increase explains the error count",
			ruledOutBecause: "traffic stayed flat while checkout errors increased",
		},
	],
	confidence: {
		level: "medium",
		reason: "the error increase is measured, but no causal source was queried",
	},
	verdict: {
		type: "act",
		reason: "checkout errors increased by 49 per day",
	},
	actions: ["Inspect the top /checkout error class before changing code"],
};

function emptyReceipts(steps = 0): InvestigationReceipts {
	return { steps, queriesRun: [], sourcesChecked: [] };
}

describe("buildReceipts", () => {
	test("lists the fixed analytics queries and one synthesis operation", () => {
		const receipts = buildReceipts(receiptParams);

		expect(receipts.steps).toBe(2);
		expect(receipts.queriesRun).toHaveLength(12);
		expect(receipts.queriesRun[0]?.tool).toBe("events_by_date");
		expect(receipts.queriesRun.at(-1)?.tool).toBe(
			"structured_memo_synthesis"
		);
		expect(receipts.sourcesChecked).toContain("summary_metrics");
		expect(receipts.sourcesChecked).toContain("revenue_overview");
	});

	test("records the exact timezone-aware query window", () => {
		const receipts = buildReceipts(receiptParams);
		const dailyInput = JSON.parse(
			receipts.queriesRun[0]?.input ?? "{}"
		) as Record<string, unknown>;
		const synthesisInput = JSON.parse(
			receipts.queriesRun.at(-1)?.input ?? "{}"
		) as Record<string, unknown>;

		expect(dailyInput).toMatchObject({
			projectId: "site_1",
			from: "2026-05-29",
			to: "2026-06-11",
			timezone: "UTC",
		});
		expect(synthesisInput.queryOutputsPersisted).toBe(false);
	});
});

describe("buildInvestigationWindow", () => {
	test("drops the extra day for odd lookbacks so both windows stay equal", () => {
		const window = buildInvestigationWindow(
			15,
			new Date("2026-06-12T15:00:00Z"),
			"UTC"
		);

		expect(window.from).toBe("2026-05-29");
		expect(window.to).toBe("2026-06-11");
		expect(window.halves).toBe(
			"2026-05-29 to 2026-06-04 vs 2026-06-05 to 2026-06-11 (7 days each)"
		);
	});

	test("anchors the last complete day in the configured timezone", () => {
		const window = buildInvestigationWindow(
			14,
			new Date("2026-06-12T01:00:00Z"),
			"America/Los_Angeles"
		);

		expect(window.to).toBe("2026-06-10");
		expect(window.h2From).toBe("2026-06-04");
		expect(window.h2To).toBe("2026-06-10");
	});
});

describe("renderMemoMarkdown", () => {
	test("renders supported sections with operation receipts", () => {
		const markdown = renderMemoMarkdown(
			sampleMemo,
			buildReceipts(receiptParams)
		);

		expect(markdown).toContain("# Checkout errors rose from 12 to 61");
		expect(markdown).toContain("## Observed sequence");
		expect(markdown).toContain("evidence: daily errors rose from 12 to 61");
		expect(markdown).toContain("## Ruled out");
		expect(markdown).toContain("## Confidence: medium");
		expect(markdown).toContain("## Do next");
		expect(markdown).toContain("2 pipeline steps, 12 attempted operations");
		expect(markdown).toContain("Query outputs are not persisted by this tool");
	});

	test("omits empty sequence, dead ends, and actions", () => {
		const emptyMemo: InvestigationMemo = {
			...sampleMemo,
			causalChain: [],
			deadEnds: [],
			actions: [],
			confidence: {
				level: "low",
				reason: "no material movement was established",
			},
		};
		const markdown = renderMemoMarkdown(emptyMemo, emptyReceipts(2));

		expect(markdown).not.toContain("## Observed sequence");
		expect(markdown).not.toContain("## Ruled out");
		expect(markdown).not.toContain("## Do next");
		expect(markdown).toContain("## Confidence: low");
	});

	test("labels act and watch verdicts", () => {
		const actMarkdown = renderMemoMarkdown(sampleMemo, emptyReceipts(2));
		const watchMarkdown = renderMemoMarkdown(
			{
				...sampleMemo,
				verdict: { type: "watch", reason: "cause unconfirmed" },
			},
			emptyReceipts(2)
		);

		expect(actMarkdown).toContain(
			"**Act now.** checkout errors increased by 49 per day"
		);
		expect(watchMarkdown).toContain("**Watch.** cause unconfirmed");
	});

	test("renders compact output for all_clear", () => {
		const allClearMemo: InvestigationMemo = {
			...sampleMemo,
			verdict: {
				type: "all_clear",
				reason: "available primary metrics stayed within normal variance",
			},
			actions: ["Recheck direct traffic next week"],
		};
		const markdown = renderMemoMarkdown(
			allClearMemo,
			buildReceipts(receiptParams)
		);

		expect(markdown).toContain("**All clear.**");
		expect(markdown).toContain("Monitor: Recheck direct traffic next week");
		expect(markdown).not.toContain("## Observed sequence");
		expect(markdown).not.toContain("## Confidence");
		expect(markdown).not.toContain("## Do next");
	});
});

describe("buildFallbackMemo", () => {
	test("preserves supplied detail as a valid low-confidence memo", () => {
		const memo = buildFallbackMemo(
			"Pageviews fell 30% on /pricing, but synthesis failed."
		);

		expect(investigationMemoSchema.safeParse(memo).success).toBe(true);
		expect(memo.narrative).toContain("/pricing");
		expect(memo.confidence.level).toBe("low");
		expect(memo.verdict.type).toBe("watch");
	});

	test("does not invent a conclusion when no detail is available", () => {
		const memo = buildFallbackMemo();
		const markdown = renderMemoMarkdown(memo, emptyReceipts(2));

		expect(investigationMemoSchema.safeParse(memo).success).toBe(true);
		expect(memo.narrative).toContain("No cause was established");
		expect(markdown).toContain("## Confidence: low");
		expect(markdown).not.toContain("agent steps");
	});
});

describe("investigationMemoSchema", () => {
	test("accepts a complete memo", () => {
		expect(investigationMemoSchema.safeParse(sampleMemo).success).toBe(true);
	});

	test("rejects confidence above what the bounded sweep can support", () => {
		for (const level of ["high", "certain"]) {
			expect(
				investigationMemoSchema.safeParse({
					...sampleMemo,
					confidence: { level, reason: "x" },
				}).success
			).toBe(false);
		}
	});

	test("renders to JSON Schema for MCP output", () => {
		expect(() =>
			z.toJSONSchema(investigationMemoSchema, { io: "output" })
		).not.toThrow();
	});
});
