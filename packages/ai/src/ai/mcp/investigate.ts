import { generateObject } from "ai";
import { z } from "zod";
import { executeQuery } from "../../query";
import { models } from "../config/models";
import { defineMcpTool, McpToolError } from "./define-tool";
import { type McpAgentToolTrace, runMcpAgentWithTrace } from "./run-agent";

const INVESTIGATION_TIMEOUT_MS = 40_000;
const SYNTHESIS_TIMEOUT_MS = 40_000;
const MAX_TRACE_INPUT_CHARS = 300;
const MAX_TRACE_OUTPUT_CHARS = 1500;

export const investigationMemoSchema = z.object({
	headline: z
		.string()
		.describe(
			"One sentence with the key numbers in it. Specific to this site, never generic."
		),
	narrative: z
		.string()
		.describe(
			"Analyst memo in markdown: what changed, why it happened, what it means. Short paragraphs, numbers inline."
		),
	causalChain: z
		.array(
			z.object({
				step: z.string().describe("One link in the cause-to-effect chain"),
				evidence: z
					.string()
					.describe("The observed data backing this link, with numbers"),
			})
		)
		.describe("Ordered cause-to-effect steps. Empty if no causal link found."),
	deadEnds: z
		.array(
			z.object({
				hypothesis: z.string(),
				ruledOutBecause: z
					.string()
					.describe("The data that ruled this hypothesis out"),
			})
		)
		.describe("Hypotheses checked and eliminated during the investigation."),
	confidence: z.object({
		level: z.enum(["high", "medium", "low"]),
		reason: z
			.string()
			.describe(
				"Why this confidence level, and what data would raise it if low"
			),
	}),
	verdict: z.object({
		type: z
			.enum(["act", "watch", "all_clear"])
			.describe(
				"act: a fixable cause with material impact, the owner should do something today. watch: something real is moving but the cause is unconfirmed or not yet actionable; name the metric to monitor. all_clear: the change is explained and is either immaterial or outside the owner's control (viral decay, seasonality, spike normalization), nothing to do."
			),
		reason: z
			.string()
			.describe("One sentence justifying the verdict, with the key number."),
	}),
	actions: z
		.array(z.string())
		.describe("Concrete next steps ranked by impact. Empty if none warranted."),
});

export type InvestigationMemo = z.infer<typeof investigationMemoSchema>;

export interface InvestigationReceipts {
	queriesRun: { tool: string; input: string }[];
	sourcesChecked: string[];
	steps: number;
}

export function buildReceipts(
	steps: number,
	toolCalls: McpAgentToolTrace[]
): InvestigationReceipts {
	return {
		steps,
		queriesRun: toolCalls.map((call) => ({
			tool: call.name,
			input: JSON.stringify(call.input ?? {}).slice(0, MAX_TRACE_INPUT_CHARS),
		})),
		sourcesChecked: [...new Set(toolCalls.map((call) => call.name))],
	};
}

function formatUtcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 86_400_000);
}

export function buildInvestigationWindow(
	lookbackDays: number,
	now: Date = new Date()
): {
	from: string;
	to: string;
	halves: string;
	halfDays: number;
	h1From: string;
	h1To: string;
	h2From: string;
	h2To: string;
} {
	const to = now;
	const from = shiftDays(to, -(lookbackDays - 1));
	const halfDays = Math.floor(lookbackDays / 2);
	const secondHalfStart = shiftDays(to, -(halfDays - 1));
	const firstHalfEnd = shiftDays(secondHalfStart, -1);
	const firstHalfStart = shiftDays(firstHalfEnd, -(halfDays - 1));
	return {
		from: formatUtcDay(from),
		to: formatUtcDay(to),
		halfDays,
		h1From: formatUtcDay(firstHalfStart),
		h1To: formatUtcDay(firstHalfEnd),
		h2From: formatUtcDay(secondHalfStart),
		h2To: formatUtcDay(to),
		halves: `${formatUtcDay(firstHalfStart)} to ${formatUtcDay(firstHalfEnd)} vs ${formatUtcDay(secondHalfStart)} to ${formatUtcDay(to)} (${halfDays} days each)`,
	};
}

async function safeQuery(
	websiteId: string,
	domain: string,
	timezone: string,
	type: string,
	from: string,
	to: string,
	extra?: { timeUnit?: "day"; limit?: number }
): Promise<Record<string, unknown>[]> {
	try {
		const rows = await executeQuery(
			{ projectId: websiteId, type, from, to, timezone, ...extra },
			domain,
			timezone
		);
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

function compactRows(rows: Record<string, unknown>[], max = 25): string {
	if (rows.length === 0) {
		return "(no rows)";
	}
	return JSON.stringify(rows.slice(0, max));
}

export async function runInvestigationSweep(params: {
	lookbackDays: number;
	now?: Date;
	timezone: string;
	websiteDomain: string;
	websiteId: string;
}): Promise<string> {
	const w = buildInvestigationWindow(params.lookbackDays, params.now);
	const { websiteId: id, websiteDomain: dom, timezone: tz } = params;
	const q = (
		type: string,
		from: string,
		to: string,
		extra?: { timeUnit?: "day"; limit?: number }
	) => safeQuery(id, dom, tz, type, from, to, extra);

	const [
		daily,
		summaryH1,
		summaryH2,
		errorsH1,
		errorsH2,
		revenueH1,
		revenueH2,
		topPages,
		topReferrers,
		countries,
		customEvents,
	] = await Promise.all([
		q("events_by_date", w.from, w.to, {
			timeUnit: "day",
			limit: params.lookbackDays + 2,
		}),
		q("summary_metrics", w.h1From, w.h1To),
		q("summary_metrics", w.h2From, w.h2To),
		q("error_summary", w.h1From, w.h1To),
		q("error_summary", w.h2From, w.h2To),
		q("revenue_overview", w.h1From, w.h1To),
		q("revenue_overview", w.h2From, w.h2To),
		q("top_pages", w.from, w.to, { limit: 12 }),
		q("top_referrers", w.from, w.to, { limit: 12 }),
		q("country", w.from, w.to, { limit: 8 }),
		q("custom_events_discovery", w.from, w.to, { limit: 30 }),
	]);

	return [
		"## Pre-gathered sweep (phases 1-2 already complete — do NOT re-run these)",
		`Window ${w.from} to ${w.to}. Halves: first ${w.h1From}..${w.h1To} vs second ${w.h2From}..${w.h2To} (${w.halfDays} days each). Final day is partial.`,
		"",
		"### Daily series (events_by_date)",
		compactRows(daily, params.lookbackDays + 2),
		"### summary_metrics — first half",
		compactRows(summaryH1),
		"### summary_metrics — second half",
		compactRows(summaryH2),
		"### error_summary — first half / second half",
		compactRows(errorsH1),
		compactRows(errorsH2),
		"### revenue_overview — first half / second half",
		compactRows(revenueH1),
		compactRows(revenueH2),
		"### top_pages (full window)",
		compactRows(topPages),
		"### top_referrers (full window)",
		compactRows(topReferrers),
		"### country (full window)",
		compactRows(countries),
		"### custom_events_discovery (full window)",
		compactRows(customEvents),
	].join("\n");
}

export function buildInvestigationBrief(params: {
	lookbackDays: number;
	now?: Date;
	question?: string;
	sweep?: string;
	websiteDomain: string;
	websiteId: string;
}): string {
	const focus = params.question
		? `The user wants to know: "${params.question}". Anchor the investigation on this, but report anything bigger you find on the way.`
		: "No specific question was asked. Find the single most consequential change on this site and explain it.";

	const window = buildInvestigationWindow(params.lookbackDays, params.now);

	const phases = params.sweep
		? [
				"The sweep and baseline queries have ALREADY been run — results are in the block below. This is your descriptive data. Do NOT re-run events_by_date, summary_metrics, error_summary, revenue_overview, top_pages, top_referrers, country, or custom-event discovery for this window; they are already below.",
				"",
				params.sweep,
				"",
				"Protocol — the data above is phases 1-2. Do only what remains, in as few turns as possible:",
				"1-2. Sweep + baseline: DONE (data above). Read it, name the single largest move and any standing funnel-failure rate.",
				"3. Enrich ONLY if a flagged move needs a breakdown that is NOT already above (e.g. device split, or errors on one specific page). If the sweep already answers where the change is concentrated, skip this — do not re-fetch pages, referrers, country, errors, or revenue.",
				"4. Correlate — this is your main remaining job (one turn, parallel tools): emit the github deploy/commit/PR checks around the inflection date, the annotations lookup, and — if the change looks search-driven — the search console query, all in the same turn. Find WHEN the cause landed relative to the effect.",
				"5. Conclude: state the causal chain with evidence for every link. Once you can write the chain, stop calling tools and answer.",
			]
		: [
				"Round-trip discipline (this is the difference between finishing and timing out): each phase is one turn, not one query. Issue every independent query in a phase together in that single turn. get_data takes up to 10 builders in one call — never call it once per builder. When a phase spans different tools (github, search console, annotations), emit all of those tool calls in the same turn so they run in parallel. Only wait for a phase's results before the next turn when the next phase actually depends on them (enrichment depends on which moves the sweep flagged; correlation depends on the inflection date).",
				"",
				"Protocol — work through every phase, in order:",
				`1. Sweep (one get_data call): batch events_by_date for the full ${params.lookbackDays}-day window, summary_metrics for each half, and — if the site records them — revenue and custom-event daily trends, all in a single call. Flag the largest moves.`,
				"2. Baseline health: if the site has a conversion funnel (payments, checkouts, signups), compute the standing failure rate for the full window (e.g. payment_failed vs payment_succeeded) — fold these builders into the sweep call when you already suspect a funnel. A high failure rate that is flat across both halves is still a primary finding; unchanged does not mean fine. Denominate it in blocked revenue or lost conversions and rank it against the largest moves from the sweep.",
				"3. Enrich (one get_data call): for the flagged moves, batch the page, referrer, country, and device breakdowns plus any error builders into a single call. Find WHERE the change is concentrated.",
				"4. Correlate (one turn, parallel tools): emit the deploy, commit, and PR checks around the inflection date, the annotations lookup, and — if the change looks search-driven — the search console query together in the same turn. Find WHEN the cause landed relative to the effect.",
				"5. Conclude: state the causal chain with evidence for every link.",
			];

	return [
		`Run a root-cause investigation on website ${params.websiteId} (${params.websiteDomain}) over the last ${params.lookbackDays} days.`,
		`Window (UTC dates, inclusive): ${window.from} to ${window.to}. For half-over-half comparisons use exactly: ${window.halves}. Note the final day is partial.`,
		focus,
		"",
		...phases,
		"",
		"Rules:",
		"- Money outranks traffic. If the site has revenue or conversion-funnel custom events (checkouts, payments, subscriptions), investigate changes there first and denominate impact in revenue or conversions; pageviews are the proxy of last resort.",
		"- Every claim needs a number from a query you actually ran.",
		"- Compare equal-length periods only. If the window splits unevenly, trim a day or quote per-day rates; never headline a raw total from an 8-day window against a 7-day one.",
		"- Quantify how much of the total change each cause explains (e.g. 'X accounts for 63 of the 230 lost visitors'). Say plainly what share remains unexplained.",
		"- Report hypotheses you ruled out and what ruled them out.",
		"- If you cannot establish a cause, say exactly what you eliminated and what data would settle it. Never hand-wave.",
		"- Timing beats correlation: an effect that starts before its supposed cause is a dead end.",
		"- If a data source errors or is not connected, name it as a gap in your findings; do not silently work around it.",
	].join("\n");
}

export function renderMemoMarkdown(
	memo: InvestigationMemo,
	receipts: InvestigationReceipts
): string {
	if (memo.verdict.type === "all_clear") {
		const lines = [
			`# ${memo.headline}`,
			"",
			`**All clear.** ${memo.verdict.reason}`,
			"",
			memo.narrative,
		];
		if (memo.actions.length > 0) {
			lines.push("", `Monitor: ${memo.actions[0]}`);
		}
		lines.push(
			"",
			`Receipts: ${receipts.steps} agent steps, ${receipts.queriesRun.length} tool calls (${receipts.sourcesChecked.join(", ")})`
		);
		return lines.join("\n");
	}

	const verdictLabel = memo.verdict.type === "act" ? "Act now" : "Watch";
	const sections = [
		`# ${memo.headline}`,
		"",
		`**${verdictLabel}.** ${memo.verdict.reason}`,
		"",
		memo.narrative,
	];

	if (memo.causalChain.length > 0) {
		sections.push(
			"",
			"## Causal chain",
			...memo.causalChain.map(
				(link, i) => `${i + 1}. ${link.step}\n   - evidence: ${link.evidence}`
			)
		);
	}

	if (memo.deadEnds.length > 0) {
		sections.push(
			"",
			"## Ruled out",
			...memo.deadEnds.map(
				(deadEnd) => `- ${deadEnd.hypothesis}: ${deadEnd.ruledOutBecause}`
			)
		);
	}

	sections.push(
		"",
		`## Confidence: ${memo.confidence.level}`,
		memo.confidence.reason
	);

	if (memo.actions.length > 0) {
		sections.push(
			"",
			"## Do next",
			...memo.actions.map((action, i) => `${i + 1}. ${action}`)
		);
	}

	sections.push(
		"",
		"## Receipts",
		`${receipts.steps} agent steps, ${receipts.queriesRun.length} tool calls: ${receipts.sourcesChecked.join(", ")}`
	);

	return sections.join("\n");
}

export function buildFallbackMemo(answer: string): InvestigationMemo {
	const narrative =
		answer.trim() ||
		"The investigation finished gathering data but produced no written findings.";
	return {
		headline: "Investigation completed; structured memo unavailable.",
		narrative,
		causalChain: [],
		deadEnds: [],
		confidence: {
			level: "low",
			reason:
				"The synthesis step failed, so this memo is the agent's raw findings without structured verification. Re-run to get a graded verdict.",
		},
		verdict: {
			type: "watch",
			reason:
				"Findings were gathered but not synthesized into a graded verdict.",
		},
		actions: [],
	};
}

function compactTrace(toolCalls: McpAgentToolTrace[]): string {
	return toolCalls
		.map((call) => {
			const input = JSON.stringify(call.input ?? {}).slice(
				0,
				MAX_TRACE_INPUT_CHARS
			);
			const output = JSON.stringify(call.output ?? null).slice(
				0,
				MAX_TRACE_OUTPUT_CHARS
			);
			return `[${call.index}] ${call.name}(${input}) => ${output}`;
		})
		.join("\n");
}

const MEMO_SYNTHESIS_SYSTEM = [
	"You turn a completed analytics investigation into a structured memo.",
	"Use ONLY facts present in the investigation findings and tool trace. Never invent numbers, dates, commits, or causes.",
	"The headline must contain the most important number. Generic headlines ('Traffic changed recently') are failures.",
	"Headline numbers must compare equal-length periods; prefer per-day rates when the underlying windows differ in length.",
	"causalChain steps must each cite evidence that appears in the trace. If the investigation found no cause, leave causalChain empty and say what was ruled out.",
	"Set confidence honestly: high only when cause, mechanism, and timing all check out AND the causal chain accounts for the majority of the observed change. If most of the change is unexplained, confidence is medium at best and the narrative must say what share remains unexplained.",
	"Classify the verdict honestly. 'act' requires both a concrete fix the site owner can execute AND material impact, denominated in revenue or conversions when the site has them. A standing structural problem (e.g. a majority of payment attempts failing) qualifies as 'act' even if the rate did not change inside the window; a problem being old does not make it fine. A cause outside the owner's control (viral decay, seasonality, a spike normalizing back to baseline) is 'all_clear' no matter how large the numbers are. A real worsening trend without a confirmed fixable cause is 'watch'.",
	"When the verdict is all_clear, keep the narrative to 2-3 sentences and limit actions to at most one monitoring step. Do not pad an all_clear finding into a full report.",
	"Actions must be verbs the owner can execute today with an expected impact. Generic advice ('diversify acquisition', 'improve content') is a failure; omit it.",
].join(" ");

export interface RunInvestigationParams {
	apiKey: Parameters<typeof runMcpAgentWithTrace>[0]["apiKey"];
	billingMode?: Parameters<typeof runMcpAgentWithTrace>[0]["billingMode"];
	lookbackDays: number;
	question?: string;
	requestHeaders: Headers;
	timezone?: string;
	userId: string | null;
	websiteDomain: string;
	websiteId: string;
}

export interface InvestigationResult {
	markdown: string;
	memo: InvestigationMemo;
	receipts: InvestigationReceipts;
}

export async function runInvestigation(
	params: RunInvestigationParams
): Promise<InvestigationResult> {
	let sweep: string | undefined;
	try {
		sweep = await runInvestigationSweep({
			lookbackDays: params.lookbackDays,
			timezone: params.timezone ?? "UTC",
			websiteDomain: params.websiteDomain,
			websiteId: params.websiteId,
		});
	} catch {
		sweep = undefined;
	}

	const brief = buildInvestigationBrief({ ...params, sweep });

	const trace = await runMcpAgentWithTrace({
		question: brief,
		requestHeaders: params.requestHeaders,
		apiKey: params.apiKey,
		userId: params.userId,
		websiteId: params.websiteId,
		websiteDomain: params.websiteDomain,
		timezone: params.timezone,
		billingMode: params.billingMode,
		mutationMode: "dry-run",
		storeMemory: false,
		timeoutMs: INVESTIGATION_TIMEOUT_MS,
	});

	const receipts = buildReceipts(trace.steps, trace.toolCalls);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);

	let memo: InvestigationMemo;
	try {
		const result = await generateObject({
			abortSignal: controller.signal,
			model: models.balanced,
			schema: investigationMemoSchema,
			system: MEMO_SYNTHESIS_SYSTEM,
			prompt: [
				...(sweep
					? [
							"Deterministic sweep (analytics data gathered before the agent ran — always reliable, use it as the descriptive backbone of the memo):",
							sweep,
							"",
						]
					: []),
				"Investigation findings (the agent's correlation and reasoning):",
				trace.answer,
				"",
				"Tool trace (what the agent actually queried and returned):",
				compactTrace(trace.toolCalls),
				...(trace.truncated
					? [
							"",
							"NOTE: The agent's correlation phase was stopped by a time limit. The deterministic sweep above is complete and reliable — ground the memo in it. The agent trace may be partial, so treat any correlation (deploys, commits) it found as a lead rather than proof. Set confidence to 'medium' at most unless the sweep alone makes the cause unambiguous.",
						]
					: []),
			].join("\n"),
		});
		memo = result.object;
	} catch {
		memo = buildFallbackMemo(trace.answer);
	} finally {
		clearTimeout(timeout);
	}

	return {
		memo,
		receipts,
		markdown: renderMemoMarkdown(memo, receipts),
	};
}

export const investigateTool = defineMcpTool(
	{
		name: "investigate",
		description:
			"Deep root-cause investigation for one website: a deterministic analytics sweep, then deploy/commit correlation, then a memo with causal chain, dead ends, confidence, and receipts. ~30-60s, always grounded. Use for 'why did X change?'",
		inputSchema: z.object({
			websiteId: z.string().optional(),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			question: z
				.string()
				.min(1)
				.max(2000)
				.optional()
				.describe(
					"Optional steering question, e.g. 'why did signups drop last week?'. Omit to find the most consequential change."
				),
			lookbackDays: z.number().int().min(7).max(60).optional().default(30),
			timezone: z
				.string()
				.optional()
				.describe("IANA timezone (e.g. 'America/New_York'). Defaults to UTC."),
		}),
		outputSchema: z.object({
			memo: investigationMemoSchema,
			receipts: z.object({
				steps: z.number(),
				queriesRun: z.array(z.object({ tool: z.string(), input: z.string() })),
				sourcesChecked: z.array(z.string()),
			}),
			markdown: z.string(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 3, windowSec: 300 },
		metadata: { evlogAction: "investigation_completed" },
	},
	async (input, ctx) => {
		try {
			return await runInvestigation({
				apiKey: ctx.apiKey,
				userId: ctx.userId,
				requestHeaders: ctx.requestHeaders,
				websiteId: ctx.websiteId as string,
				websiteDomain: ctx.websiteDomain ?? "unknown",
				question: input.question,
				lookbackDays: input.lookbackDays,
				timezone: input.timezone,
			});
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new McpToolError(
					"upstream_timeout",
					"Investigation timed out. Try a narrower question or a shorter lookbackDays.",
					{
						hint: "Investigations run a multi-step agent and can take 1-2 minutes.",
					}
				);
			}
			throw err;
		}
	}
);
