import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { describe, expect, it } from "bun:test";
import {
	buildBlocks,
	buildFallbackText,
	buildSlackPostPayload,
	buildThreadBlocks,
	postToSlack,
} from "./delivery";
import type { WebsiteInvestigation } from "./persistence";

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

const signal: InvestigationSignal = {
	signalKey: "goal:pricing",
	websiteId: "site-1",
	insightType: "conversion_leak",
	entity: { type: "goal", id: "pricing", label: "Pricing viewers" },
	metric: {
		key: "goal_completion_rate",
		label: "Pricing goal completion",
		current: 17,
		previous: 32,
		format: "number",
	},
	changePercent: -46.9,
	direction: "down",
	severity: "warning",
	sentiment: "negative",
	priority: 8,
	period: {
		current: { from: "2026-06-28", to: "2026-07-04" },
		previous: { from: "2026-06-21", to: "2026-06-27" },
	},
	detectedAt: "2026-07-05",
	detection: {
		method: "period_comparison",
		reason: "Pricing goal completion fell 46.9%.",
	},
};

const outcome: InvestigationOutcome = {
	title: "Pricing intent is undercounted by about 47%",
	summary:
		"The goal only matches /billing, but 15 of 32 billing visitors landed on nested billing routes.",
	impact: "Billing interest is stronger than the goal reports.",
	rootCause: "The goal definition excludes nested billing routes.",
	rootCauseConfidence: 0.95,
	impactConfidence: 0.8,
	evidence: ["15 of 32 billing visitors used nested routes."],
	sources: ["product"],
	next: {
		type: "act",
		action: "Include nested billing routes in the goal.",
		kind: "configuration",
		owner: "Growth",
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

function finding(
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

describe("Slack finding delivery", () => {
	it("retries rate limits with the same durable message ID", async () => {
		const responses = [
			new Response("rate limited", {
				headers: { "Retry-After": "2" },
				status: 429,
			}),
			Response.json({ ok: true, ts: "123.456" }),
		];
		const requests: RequestInit[] = [];
		const delays: number[] = [];
		const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			requests.push(init ?? {});
			const response = responses.shift();
			if (!response) {
				throw new Error("Unexpected Slack request");
			}
			return response;
		}) as typeof fetch;

		const externalId = await postToSlack(
			"token",
			"channel-test",
			[{ type: "divider" }],
			"Finding",
			"effect-test",
			{
				fetcher,
				random: () => 0,
				sleep: async (milliseconds) => delays.push(milliseconds),
			}
		);

		expect(externalId).toBe("123.456");
		expect(delays).toEqual([2000]);
		expect(requests).toHaveLength(2);
		expect(requests.every((request) => request.signal instanceof AbortSignal)).toBe(
			true
		);
		expect(requests[0]?.body).toBe(requests[1]?.body);
	});

	it("uses the durable effect ID as Slack's client message ID", () => {
		expect(
			buildSlackPostPayload(
				"channel-test",
				[{ type: "divider" }],
				"Finding",
				"effect-test"
			)
		).toEqual({
			blocks: [{ type: "divider" }],
			channel: "channel-test",
			client_msg_id: "effect-test",
			text: "Finding",
		});
	});

	it("renders one actionable investigation", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			goalInvestigation
		);

		expect(blocks[0]?.text?.text).toBe(
			"Findings for Databuddy (app.databuddy.cc)"
		);
		expect(contextText(blocks, 1)).toBe("Fix · Jun 28 to Jul 4");
		expect(sectionText(blocks, 2)).toContain(outcome.title);
		expect(sectionText(blocks, 3)).toContain(`>${outcome.summary}`);
		expect(sectionText(blocks, 3)).toContain(outcome.impact ?? "");
		expect(sectionText(blocks, 3)).toContain("*Next:* Include nested billing");
		expect(blocks).toHaveLength(4);
		expect(buildFallbackText("Databuddy <@U123>", "app.databuddy.cc")).toBe(
			"Findings for Databuddy &lt;@U123&gt; (app.databuddy.cc)"
		);
	});

	it("renders a question as a review, not a fix", () => {
		const next: InvestigationOutcome["next"] = {
			type: "ask",
			question: "Was this goal change intentional?",
			who: "Growth",
			why: "The answer determines whether to restore the definition.",
		};
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			finding({ id: "question", outcome: { next } })
		);

		expect(contextText(blocks, 1)).toContain("Review");
		expect(sectionText(blocks, 3)).toContain(
			"*Next:* Ask Growth: Was this goal change intentional?"
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
			finding({
				outcome: {
					next,
					summary: `Two funnels share id ${uuid}.`,
					title: `Duplicate funnel ${uuid} is active`,
				},
			})
		);

		expect(JSON.stringify(blocks)).not.toContain("019d7dac");
		expect(JSON.stringify(blocks)).toContain("the affected item");
	});

	it("uses the positive acquisition label", () => {
		const blocks = buildBlocks(
			null,
			"example.com",
			finding({
				id: "trend",
				outcome: { title: "Traffic tripled this week" },
				signal: {
					insightType: "positive_trend",
					sentiment: "positive",
				},
			})
		);

		expect(blocks[0]?.text?.text).toBe("Findings for example.com");
		expect(contextText(blocks, 1)).toContain("Opportunity");
		expect(sectionText(blocks, 2)).toStartWith(":large_green_circle:");
		expect(blocks).toHaveLength(4);
	});

	it("omits unproven operational impact", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			finding({ outcome: { impact: null } })
		);

		expect(sectionText(blocks, 3)).not.toContain(
			"Billing interest is stronger"
		);
		expect(sectionText(blocks, 3)).toContain("*Next:*");
	});
});

describe("Slack investigation detail", () => {
	it("renders the measured signal, proven cause, and evidence", () => {
		const text = buildThreadBlocks(goalInvestigation)[0]?.text?.text ?? "";

		expect(text).toContain("Pricing goal completion: 17 (was 32)");
		expect(text).toContain("_Why:_ The goal definition excludes");
		expect(text).toContain("15 of 32 billing visitors");
	});

	it("formats percent and duration units", () => {
		const percent = finding({
			signal: {
				metric: {
					key: "bounce_rate",
					label: "Bounce rate",
					current: 62,
					previous: 40,
					format: "percent",
				},
			},
		});
		const duration = finding({
			signal: {
				metric: {
					key: "lcp",
					label: "Load time",
					current: 3200,
					format: "duration_ms",
				},
			},
		});

		expect(buildThreadBlocks(percent)[0]?.text?.text).toContain(
			"Bounce rate: 62% (was 40%)"
		);
		expect(buildThreadBlocks(duration)[0]?.text?.text).toContain(
			"Load time: 3,200ms"
		);
	});
});
