import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { describe, expect, it } from "bun:test";
import {
	buildBlocks,
	buildInsightReplyText,
	insightSlackEffectPayloadSchema,
} from "./delivery";
import type { WebsiteInvestigation } from "./persistence";

type Blocks = ReturnType<typeof buildBlocks>;

function sectionText(blocks: Blocks, index: number) {
	return blocks[index]?.text?.text ?? "";
}

const signal: InvestigationSignal = {
	signalKey: "goal:pricing",
	entity: { type: "goal", id: "pricing", label: "Pricing viewers" },
	metric: {
		label: "Pricing goal completion",
		current: 17,
		previous: 32,
		format: "number",
	},
	changePercent: -46.9,
	severity: "warning",
	sentiment: "negative",
	period: {
		current: { from: "2026-06-28", to: "2026-07-04" },
		previous: { from: "2026-06-21", to: "2026-06-27" },
	},
};

const outcome: InvestigationOutcome = {
	title: "Pricing intent is undercounted by about 47%",
	summary:
		"The goal only matches /billing, but 15 of 32 billing visitors landed on nested billing routes.",
	impact: "Billing interest is stronger than the goal reports.",
	rootCause: "The goal definition excludes nested billing routes.",
	evidence: ["15 of 32 billing visitors used nested routes."],
	next: {
		type: "act",
		action: "Include nested billing routes in the goal.",
		target: "Pricing viewers goal",
		verification: "Goal completions match nested route visits.",
	},
};

const goalInvestigation: WebsiteInvestigation = {
	id: "goal-insight",
	outcome,
	signal,
	websiteDomain: "app.databuddy.cc",
	websiteId: "site-1",
	websiteName: "Databuddy",
};

function investigationWith(
	changes: {
		id?: string;
		outcome?: Partial<InvestigationOutcome>;
		signal?: Partial<InvestigationSignal>;
	} = {}
): WebsiteInvestigation {
	return {
		...goalInvestigation,
		id: changes.id ?? goalInvestigation.id,
		outcome: { ...outcome, ...changes.outcome } as InvestigationOutcome,
		signal: { ...signal, ...changes.signal } as InvestigationSignal,
	};
}

describe("Slack investigation delivery", () => {
	it("keeps the canonical insight id in new effects without breaking old ones", () => {
		expect(
			insightSlackEffectPayloadSchema.parse({
				blocks: [],
				insightId: "case-1",
				text: "Checkout conversion fell",
			}).insightId
		).toBe("case-1");
		expect(
			insightSlackEffectPayloadSchema.parse({
				blocks: [],
				text: "Legacy delivery",
			}).insightId
		).toBeUndefined();
	});

	it("renders a specific question without unproven impact", () => {
		const next: InvestigationOutcome["next"] = {
			type: "ask",
			question:
				"Were nested billing routes intentionally removed from the Pricing viewers goal?",
		};
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			investigationWith({ id: "question", outcome: { impact: null, next } })
		);

		expect(sectionText(blocks, 3)).toContain(`*Next:* ${next.question}`);
		expect(sectionText(blocks, 3)).not.toContain(
			"Billing interest is stronger"
		);
	});

	it("redacts UUIDs from all visible copy", () => {
		const uuid = "019d7dac-6c23-7000-b8b0-b5cacc81db79";
		const next: InvestigationOutcome["next"] = {
			...outcome.next,
			action: `Delete funnel ${uuid}.`,
		};
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			investigationWith({
				outcome: {
					next,
					summary: `Two funnels share id ${uuid}.`,
					title: `Duplicate funnel ${uuid} is active`,
				},
			})
		);

		expect(JSON.stringify(blocks)).not.toContain("019d7dac");
	});

});

describe("Slack investigation detail", () => {
	it("labels every reply outcome and escapes Slack mentions", () => {
		const action = buildInsightReplyText(
			{ ...outcome, title: "Fix <@U123> attribution" },
			signal
		);
		const question = buildInsightReplyText(
			{
				...outcome,
				impact: null,
				next: { question: "Was this change intentional?", type: "ask" },
			},
			signal
		);
		const watching = buildInsightReplyText(
			{
				...outcome,
				next: {
					escalation: "Escalate if completion stays below 20.",
					type: "watch",
				},
			},
			signal
		);
		const structuredWatch = buildInsightReplyText(
			{
				...outcome,
				next: {
					escalation:
						"Escalate when Pricing goal completion is below 20 (prior baseline).",
					recheckAt: "2026-07-20T00:00:00.000Z",
					threshold: {
						anchor: "prior_baseline",
						comparison: "below",
						value: 20,
					},
					type: "watch",
				},
			},
			signal
		);
		const resolved = buildInsightReplyText(
			{
				...outcome,
				next: { reason: "The goal recovered.", type: "resolve" },
			},
			signal
		);

		expect(action).toStartWith("*Action ·");
		expect(action).toContain("&lt;@U123&gt;");
		expect(question).toStartWith("*Question ·");
		expect(watching).toStartWith("*Watching ·");
		expect(watching).toContain("Watch Pricing goal completion.");
		expect(structuredWatch).toContain(
		"*Next:* Escalate when Pricing goal completion is below 20 (prior baseline)."
	);
		expect(structuredWatch).not.toContain("Watch Pricing goal completion");
		expect(resolved).toStartWith("*Resolved ·");
	});
});
