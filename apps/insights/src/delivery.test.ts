import { describe, expect, it } from "bun:test";
import { buildBlocks, buildFallbackText, buildThreadBlocks } from "./delivery";

type Blocks = ReturnType<typeof buildBlocks>;

function sectionText(blocks: Blocks, index: number) {
	return blocks[index]?.text?.text ?? "";
}

function contextText(blocks: Blocks, index: number) {
	const element = blocks[index]?.elements?.[0] as
		| { text?: string }
		| undefined;
	return element?.text ?? "";
}

function accessoryUrl(blocks: Blocks, index: number) {
	const accessory = blocks[index]?.accessory as { url?: string } | undefined;
	return accessory?.url ?? "";
}

const goalInsight = {
	actions: [{ label: "Switch goal to /billing contains" }],
	currentPeriodFrom: "2026-06-28",
	currentPeriodTo: "2026-07-04",
	description:
		"The goal only matches /billing, but 15 of 32 billing visitors landed on /billing/plans or /billing/history.",
	id: "goal-insight",
	impactSummary: "  Billing interest is stronger than the goal reports.  ",
	severity: "warning",
	sentiment: "negative",
	suggestion: "Edit the Pricing viewers goal and include nested billing routes.",
	title: "Pricing intent is undercounted by about 47%",
	type: "conversion_leak",
};

describe("Slack insight digest blocks", () => {
	it("uses the website name with domain in the header", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[goalInsight],
			[]
		);

		expect(blocks[0]?.text?.text).toBe(
			"Insights for Databuddy (app.databuddy.cc)"
		);
		expect(buildFallbackText("Databuddy <@U123>", "app.databuddy.cc")).toBe(
			"Insights for Databuddy &lt;@U123&gt; (app.databuddy.cc)"
		);
	});

	it("renders summary chip, title with link button, quoted evidence, and label chip", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[goalInsight],
			[]
		);

		expect(blocks.map((b) => b.type)).toEqual([
			"header",
			"context",
			"section",
			"section",
			"context",
		]);
		expect(contextText(blocks, 1)).toBe("1 fix · week of Jun 28 to Jul 4");
		expect(sectionText(blocks, 2)).toBe(
			":red_circle: *Pricing intent is undercounted by about 47%*"
		);
		expect(accessoryUrl(blocks, 2)).toContain("/insights#insight-goal-insight");
		expect(sectionText(blocks, 3)).toContain(">The goal only matches");
		expect(sectionText(blocks, 3)).toContain(
			"\nBilling interest is stronger than the goal reports."
		);
		expect(contextText(blocks, 4)).toBe("Fix · Goal tracking");
	});

	it("counts mixed labels in the summary chip and omits the period when missing", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[
				{ ...goalInsight, currentPeriodFrom: null, currentPeriodTo: null },
				{
					...goalInsight,
					currentPeriodFrom: null,
					currentPeriodTo: null,
					id: "trend",
					sentiment: "positive",
					type: "positive_trend",
				},
			],
			[]
		);

		expect(contextText(blocks, 1)).toBe("1 fix · 1 win");
	});

	it("omits the impact line when no impact summary exists", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[{ ...goalInsight, impactSummary: null }],
			[]
		);

		expect(sectionText(blocks, 3)).toBe(
			">The goal only matches /billing, but 15 of 32 billing visitors landed on /billing/plans or /billing/history."
		);
	});

	it("separates insights with dividers but does not trail one", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[goalInsight, { ...goalInsight, id: "second" }],
			[]
		);

		expect(blocks.filter((b) => b.type === "divider")).toHaveLength(1);
		expect(blocks.at(-1)?.type).toBe("context");
	});

	it("does not expose raw IDs in visible Slack copy", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[
				{
					actions: [],
					description:
						"Two funnels share ids 019d7dac-6c23-7000-b8b0-b5cacc81db79 and 019d7dac-ef9b-... but have identical results.",
					id: "duplicate-funnel",
					severity: "warning",
					sentiment: "negative",
					suggestion: "Delete funnel 019d7dac-6c23-7000-b8b0-b5cacc81db79.",
					title:
						"Duplicate funnel 019d7dac-6c23-7000-b8b0-b5cacc81db79 is active",
					type: "funnel_regression",
				},
			],
			[]
		);

		expect(sectionText(blocks, 2)).toContain(
			"*Duplicate funnel the affected item is active*"
		);
		expect(sectionText(blocks, 3)).toContain(
			">Two funnels share ids the affected item"
		);
		expect(contextText(blocks, 4)).toBe("Cleanup · Funnel config");
		for (const block of blocks) {
			expect(block.text?.text ?? "").not.toContain("019d7dac");
		}
	});

	it("marks cross-site patterns in the label chip", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[goalInsight],
			[
				{
					insightIds: ["goal-insight"],
					websiteIds: ["site-a", "site-b", "site-c"],
				} as never,
			]
		);

		expect(contextText(blocks, 4)).toBe(
			"Fix · Goal tracking · part of a pattern across 3 sites"
		);
	});

	it("handles legacy insight rows without type or sentiment fields", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[
				{
					description: "A historical insight row was missing newer metadata.",
					id: "legacy-insight",
					severity: "warning",
					suggestion: "Review this legacy insight.",
					title: "Legacy insight still renders",
				},
			],
			[]
		);

		expect(contextText(blocks, 1)).toBe("1 fix");
		expect(contextText(blocks, 4)).toBe("Fix · Priority signal");
		expect(sectionText(blocks, 2)).toStartWith(":red_circle:");
	});

	it("renders escalations as compact one-line sections after the cards", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[goalInsight],
			[],
			[
				{
					...goalInsight,
					id: "flag-telemetry",
					title: "Feature-flag telemetry stayed near-silent this week",
				},
			]
		);

		expect(contextText(blocks, 1)).toBe(
			"1 fix · 1 escalation · week of Jun 28 to Jul 4"
		);
		const last = blocks.at(-1);
		expect(last?.type).toBe("section");
		expect(last?.text?.text).toContain(":small_red_triangle_up:");
		expect(last?.text?.text).toContain(
			"Feature-flag telemetry stayed near-silent this week"
		);
		expect(last?.text?.text).toContain("Still open and now worse");
		expect(blocks.filter((b) => b.type === "divider")).toHaveLength(1);
	});

	it("renders an escalation-only digest without cards", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[],
			[],
			[goalInsight]
		);

		expect(contextText(blocks, 1)).toBe(
			"1 escalation · week of Jun 28 to Jul 4"
		);
		expect(blocks.filter((b) => b.type === "divider")).toHaveLength(0);
		expect(blocks.at(-1)?.type).toBe("section");
	});

	it("uses the green marker and domain fallback for positive trends", () => {
		const blocks = buildBlocks(
			null,
			"example.com",
			[
				{
					description: "Traffic rose from 10 to 30 sessions.",
					id: "traffic-insight",
					severity: "info",
					sentiment: "positive",
					suggestion: "Annotate the campaign.",
					title: "Traffic tripled this week",
					type: "positive_trend",
				},
			],
			[]
		);

		expect(blocks[0]?.text?.text).toBe("Insights for example.com");
		expect(contextText(blocks, 1)).toBe("1 win");
		expect(sectionText(blocks, 2)).toStartWith(":large_green_circle:");
		expect(contextText(blocks, 4)).toBe("Opportunity · Acquisition");
	});
});

describe("buildThreadBlocks", () => {
	const detailed = {
		currentPeriodFrom: "2026-06-28",
		currentPeriodTo: "2026-07-04",
		description: "48 people started signup but only 5 finished.",
		evidence: [
			{ description: "67 of 67 onboarding visitors exit on that page." },
		],
		id: "goal-insight",
		metrics: [
			{ label: "Signups started", current: 48, previous: 10, format: "number" },
			{ label: "Signups completed", current: 5, previous: 38, format: "number" },
		],
		rootCause: "The onboarding step handler throws before completion.",
		severity: "warning",
		suggestion: "Trace a failing signup session.",
		title: "Signup leak deepened",
		type: "conversion_leak",
	} as never;

	it("renders metrics with before/after, root cause, and evidence", () => {
		const blocks = buildThreadBlocks([detailed]);
		expect(blocks).toHaveLength(1);
		const text = blocks[0]?.text?.text ?? "";
		expect(text).toContain("*Signup leak deepened*");
		expect(text).toContain("Signups started: 48 (was 10)");
		expect(text).toContain("Signups completed: 5 (was 38)");
		expect(text).toContain("_Why:_ The onboarding step handler");
		expect(text).toContain("67 of 67 onboarding visitors");
	});

	it("skips insights with no metrics, evidence, or root cause", () => {
		const bare = {
			description: "d",
			id: "bare",
			severity: "info",
			suggestion: "s",
			title: "Bare card",
		} as never;
		expect(buildThreadBlocks([bare])).toHaveLength(0);
	});

	it("formats percent and duration metrics", () => {
		const perf = {
			description: "d",
			id: "perf",
			metrics: [
				{ label: "Bounce rate", current: 62, previous: 40, format: "percent" },
				{ label: "Load time", current: 3200, format: "duration_ms" },
			],
			severity: "warning",
			suggestion: "s",
			title: "Perf card",
		} as never;
		const text = buildThreadBlocks([perf])[0]?.text?.text ?? "";
		expect(text).toContain("Bounce rate: 62% (was 40%)");
		expect(text).toContain("Load time: 3,200ms");
	});

	it("includes escalation detail after capped card detail", () => {
		const escalation = { ...detailed, id: "esc", title: "Still open" };
		const blocks = buildThreadBlocks([detailed], [escalation]);
		expect(blocks).toHaveLength(2);
		expect(blocks[1]?.text?.text).toContain("*Still open*");
	});
});
