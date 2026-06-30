import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type PromptRegistration = Parameters<McpServer["registerPrompt"]>;
type PromptArgs = Record<string, string | undefined>;

interface PromptDef {
	args?: Record<string, z.ZodTypeAny>;
	body: (args: PromptArgs) => string;
	description: string;
	name: string;
	title: string;
}

const websiteArg = z
	.string()
	.optional()
	.describe(
		"Website to scope the workflow to. Accepts websiteId, websiteName, or websiteDomain. Optional when only one website is accessible."
	);

const periodArg = z
	.enum(["last_7d", "last_14d", "last_30d", "last_90d"])
	.optional()
	.describe("Date range preset. Defaults to last_7d.");

function scopeLine(website: string | undefined, period?: string): string {
	const websiteLine = website
		? `Scope: website = ${website}.`
		: "Scope: confirm websiteName/Domain/Id with list_websites first if more than one is accessible.";
	return period
		? `${websiteLine}\nDate range: preset = ${period}.`
		: websiteLine;
}

const DATABUDDY_PROMPTS: PromptDef[] = [
	{
		name: "weekly_report",
		title: "Weekly analytics report",
		description:
			"Produce a structured weekly digest: traffic trends, top pages, top referrers, error health, and one item worth investigating.",
		args: { website: websiteArg, period: periodArg },
		body: (args) => `Build a weekly analytics digest.

${scopeLine(args.website, args.period)}

Two parallel calls:
- get_data batch: summary_metrics, top_pages (limit 5), top_referrers (limit 5), error_summary, errors_by_type (limit 3).
- compare_metric with metrics=['visitors','sessions','pageviews','bounce_rate'] for week-over-week deltas (and top_movers dimension='pages' if a deeper traffic shift matters).

Summarize in this order:
1. Headline movement: each summary metric vs prior period, using compare_metric's headline strings.
2. Top 3 traffic drivers (pages or referrers) with absolute sessions. Note any from top_movers that surged or dropped >20%.
3. Error health: total errors, error rate, top 1 error class from errors_by_type with affected users.
4. One actionable item worth investigating this week — pick the largest unexplained delta or the highest-impact error.

Format the digest as short bullets. Skip empty sections. Never fabricate metrics that didn't return data.`,
	},
	{
		name: "triage_errors",
		title: "Triage recent errors",
		description:
			"Walk through error_summary → errors_by_type → errors_by_page → recent_errors for the top class, then prioritize by user impact.",
		args: { website: websiteArg, period: periodArg },
		body: (args) => `Triage recent JavaScript errors.

${scopeLine(args.website, args.period)}

Steps (batch as much as you can into one get_data call with queries[]):
1. error_summary — total errors, error rate, affected users, affected sessions.
2. errors_by_type (limit 10) — top JS error classes (TypeError, ReferenceError, …) with users + sessions. Each row's 'name' is the error_type field.
3. errors_by_page (limit 10) — pages where errors concentrate.
4. For the top 1–2 classes, recent_errors with limit=10 and filter [{field:'error_type', op:'eq', value:'<class>'}]. To drill into a specific message instead, filter [{field:'message', op:'contains', value:'<text>'}]. Stack traces are server-capped at 1500 chars.

Sort findings by impact = users × count (use errors_by_type's 'users' and 'count' columns directly — no extra calls needed).

For each priority, output:
- Error class + a representative message excerpt
- Affected users / total occurrences
- Top 1–2 pages with the most occurrences
- Likely root cause guess (1 line) and next investigation step

Skip the noise: AbortError, ResizeObserver loop limit, browser-extension stacks. Flag them but don't lead with them.`,
	},
	{
		name: "funnel_health",
		title: "Audit funnel conversion health",
		description:
			"List funnels, run per-step analytics, surface the largest drop-offs and any funnel that recently degraded.",
		args: { website: websiteArg, period: periodArg },
		body: (args) => `Audit funnel health.

${scopeLine(args.website, args.period)}

Steps:
1. list_funnels — enumerate active funnels (skip archived).
2. For each funnel, get_funnel_analytics for the current window. Capture overall conversion and per-step drop-off.
3. If the user asked about a change vs prior period, call get_funnel_analytics again with from/to set to the immediately preceding window and diff the overall conversion. (compare_metric does NOT support funnel conversion — it only handles summary metrics.)

Output table, one row per funnel:
- Funnel name
- Overall conversion (and Δ vs prior period if computed)
- Worst step (biggest absolute drop) — name + drop %
- Status: healthy, watch, leaking — use the funnel's own historical baseline if available, otherwise <2% absolute conversion is "leaking".

End with 1–3 concrete next steps (which step to investigate, which segment to drill into).`,
	},
	{
		name: "flag_rollout_check",
		title: "Review feature flag rollout state",
		description:
			"List feature flags and flag stale, over-targeted, or risky rollouts that need a decision.",
		args: { website: websiteArg },
		body: (args) => `Review feature flag rollout state.

${scopeLine(args.website)}

Steps:
1. list_flags with status='active' — skip archived/inactive in one call.
2. For each flag, note: type (boolean/rollout/multivariant), rolloutPercentage, number of rules, last update time.

Surface, in order:
- Stale flags: status=active and not updated in >30 days, especially rollouts at 100%. Candidates for cleanup.
- Risky rollouts: rolloutPercentage between 1-99 for >14 days without movement. Either ramp or roll back.
- Overlapping rules: same flag with >5 rules — review for redundancy.
- Missing description or unclear name.

For each finding, recommend one action: cleanup, ramp, roll back, or document. Don't propose mutations without explicit user confirmation.`,
	},
];

export function registerDatabuddyPrompts(server: McpServer): void {
	for (const prompt of DATABUDDY_PROMPTS) {
		// The SDK's zod-compat type targets a different Zod surface than this repo's Zod v4.
		const config = {
			title: prompt.title,
			description: prompt.description,
			argsSchema: prompt.args,
		} as unknown as PromptRegistration[1];

		const callback = ((args: PromptArgs) => ({
			messages: [
				{
					role: "user" as const,
					content: { type: "text" as const, text: prompt.body(args) },
				},
			],
		})) as unknown as PromptRegistration[2];

		server.registerPrompt(prompt.name, config, callback);
	}
}
