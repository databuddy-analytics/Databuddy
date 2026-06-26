import { describe, expect, it } from "bun:test";
import { buildBlocks, buildFallbackText } from "./delivery";

function sectionText(blocks: ReturnType<typeof buildBlocks>, index: number) {
	return blocks[index]?.text?.text ?? "";
}

describe("Slack insight digest markdown", () => {
	it("uses the website name with domain in the header", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[
				{
					actions: [{ label: "Switch goal to /billing contains" }],
					description:
						"The goal only matches /billing, but 15 of 32 billing visitors landed on /billing/plans or /billing/history.",
					id: "insight-1",
					impactSummary:
						"Billing interest is stronger than the goal reports.",
					severity: "warning",
					sentiment: "negative",
					suggestion:
						"Edit the goal id 019d7dac-6c23-7000-b8b0-b5cacc81db79.",
					title: "Pricing intent is undercounted by about 47%",
					type: "conversion_leak",
				},
			],
			[]
		);

		expect(blocks[0]?.text?.text).toBe(
			"Insights for Databuddy (app.databuddy.cc)"
		);
		expect(buildFallbackText("Databuddy <@U123>", "app.databuddy.cc")).toBe(
			"Insights for Databuddy &lt;@U123&gt; (app.databuddy.cc)"
		);
	});

	it("renders each card as label, title, evidence, impact, and next action", () => {
		const blocks = buildBlocks(
			"Databuddy",
			"app.databuddy.cc",
			[
				{
					actions: [{ label: "Switch goal to /billing contains" }],
					description:
						"The goal only matches /billing, but 15 of 32 billing visitors landed on /billing/plans or /billing/history.",
					id: "goal-insight",
					impactSummary:
						"  Billing interest is stronger than the goal reports.  ",
					severity: "warning",
					sentiment: "negative",
					suggestion:
						"Edit the Pricing viewers goal and include nested billing routes.",
					title: "Pricing intent is undercounted by about 47%",
					type: "conversion_leak",
				},
				{
					actions: [{ label: "Fix clipboard copy on /onboarding" }],
					description:
						"A single /onboarding session produced 94% of this week's errors after Firefox blocked clipboard access.",
					id: "error-insight",
					impactSummary:
						"The error feed is being distorted by one retry loop.",
					severity: "warning",
					sentiment: "negative",
					suggestion:
						"Wrap navigator.clipboard.writeText in a try/catch with document.execCommand('copy').",
					title: "One Firefox session caused 168 clipboard errors",
					type: "persistent_error_hotspot",
				},
			],
			[]
		);

		expect(blocks).toHaveLength(3);
		expect(sectionText(blocks, 1)).toContain("*Fix · Goal tracking*");
		expect(sectionText(blocks, 1)).toContain(
			"*Pricing intent is undercounted by about 47%*"
		);
		expect(sectionText(blocks, 1)).toContain("Evidence: The goal only matches");
		expect(sectionText(blocks, 1)).toContain(
			"Why it matters: Billing interest is stronger"
		);
		expect(sectionText(blocks, 1)).not.toContain(
			"Why it matters:   Billing"
		);
		expect(sectionText(blocks, 1)).toContain(
			"Next: Switch goal to /billing contains"
		);
		expect(sectionText(blocks, 2)).toContain("*Fix · Error volume*");
		expect(sectionText(blocks, 2)).toContain(
			"Next: Fix clipboard copy on /onboarding"
		);
		expect(sectionText(blocks, 1)).not.toContain("One Firefox");
	});

	it("does not expose raw IDs or code-heavy suggestions in visible Slack copy", () => {
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
					suggestion:
						"Delete funnel 019d7dac-6c23-7000-b8b0-b5cacc81db79 and run document.execCommand('copy') in the console.",
					title:
						"Duplicate funnel 019d7dac-6c23-7000-b8b0-b5cacc81db79 is active",
					type: "funnel_regression",
				},
			],
			[]
		);

		const text = sectionText(blocks, 1);
		expect(text).toContain("*Cleanup · Funnel config*");
		expect(text).toContain("*Duplicate funnel the affected item is active*");
		expect(text).toContain("Evidence: Two funnels share ids the affected item");
		expect(text).toContain(
			"Next: Review the funnel configuration and remove duplicate setup if present."
		);
		expect(text).not.toContain("019d7dac");
		expect(text).not.toContain("document.execCommand");
		expect(text).not.toContain("Delete funnel");
	});

	it("falls back to the domain when no website name exists", () => {
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
		expect(sectionText(blocks, 1)).toContain("*Opportunity · Acquisition*");
		expect(sectionText(blocks, 1)).toContain("Next: Annotate the campaign.");
	});
});
