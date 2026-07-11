import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { validateTimezone } from "@databuddy/validation";
import { generateObject } from "ai";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import { z } from "zod";
import { DatabuddyAgentUserError } from "../../agent/errors";
import { executeQuery } from "../../query";
import {
	ensureAgentCreditsAvailable,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "../agents/execution";
import { modelNames, models } from "../config/models";
import { defineMcpTool, McpToolError } from "./define-tool";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const SYNTHESIS_TIMEOUT_MS = 40_000;
const SWEEP_TIMEOUT_MS = 15_000;

export const investigationMemoSchema = z.object({
	headline: z.string().describe("One specific sentence with the key numbers."),
	narrative: z
		.string()
		.describe(
			"What changed, what the data supports, and what remains unknown."
		),
	causalChain: z
		.array(
			z.object({
				step: z.string(),
				evidence: z.string(),
			})
		)
		.describe("Observed sequence only; empty when the data cannot prove one."),
	deadEnds: z
		.array(
			z.object({
				hypothesis: z.string(),
				ruledOutBecause: z.string(),
			})
		)
		.describe("Only hypotheses directly tested by the supplied data."),
	confidence: z.object({
		level: z.enum(["medium", "low"]),
		reason: z
			.string()
			.describe("Include unavailable data that limits confidence."),
	}),
	verdict: z.object({
		type: z
			.enum(["act", "watch", "all_clear"])
			.describe(
				"act: material observed issue; watch: real but uncertain change; all_clear: sufficient data shows no material issue."
			),
		reason: z.string().describe("One sentence with the key number."),
	}),
	actions: z
		.array(z.string())
		.describe("Cautious, reversible next checks grounded in the data."),
});

export type InvestigationMemo = z.infer<typeof investigationMemoSchema>;

export interface InvestigationReceipts {
	queriesRun: { tool: string; input: string }[];
	sourcesChecked: string[];
	steps: number;
}

interface InvestigationWindow {
	from: string;
	h1From: string;
	h1To: string;
	h2From: string;
	h2To: string;
	halfDays: number;
	halves: string;
	to: string;
}

interface InvestigationSweep {
	complete: boolean;
	hasData: boolean;
	text: string;
}

interface SweepQuery {
	from: string;
	label: string;
	limit?: number;
	timeUnit?: "day";
	to: string;
	type: string;
}

type SweepRange = "all" | "first" | "second";

const SWEEP_QUERY_SPECS = [
	["Daily series", "events_by_date", "all"],
	["Summary metrics — first window", "summary_metrics", "first"],
	["Summary metrics — second window", "summary_metrics", "second"],
	["Error summary — first window", "error_summary", "first"],
	["Error summary — second window", "error_summary", "second"],
	["Revenue overview — first window", "revenue_overview", "first"],
	["Revenue overview — second window", "revenue_overview", "second"],
	["Top pages — full window", "top_pages", "all", 12],
	["Top referrers — full window", "top_referrers", "all", 12],
	["Countries — full window", "country", "all", 8],
	["Custom events — full window", "custom_events_discovery", "all", 30],
] as const satisfies readonly (
	| readonly [string, string, SweepRange]
	| readonly [string, string, SweepRange, number]
)[];

function formatDay(value: dayjs.Dayjs): string {
	return value.format("YYYY-MM-DD");
}

export function buildInvestigationWindow(
	lookbackDays: number,
	now: Date = new Date(),
	timezone = "UTC"
): InvestigationWindow {
	const halfDays = Math.max(1, Math.floor(lookbackDays / 2));
	const lastCompleteDay = dayjs(now)
		.tz(timezone)
		.subtract(1, "day")
		.startOf("day");
	const secondHalfStart = lastCompleteDay.subtract(halfDays - 1, "day");
	const firstHalfEnd = secondHalfStart.subtract(1, "day");
	const firstHalfStart = firstHalfEnd.subtract(halfDays - 1, "day");

	return {
		from: formatDay(firstHalfStart),
		to: formatDay(lastCompleteDay),
		halfDays,
		h1From: formatDay(firstHalfStart),
		h1To: formatDay(firstHalfEnd),
		h2From: formatDay(secondHalfStart),
		h2To: formatDay(lastCompleteDay),
		halves: `${formatDay(firstHalfStart)} to ${formatDay(firstHalfEnd)} vs ${formatDay(secondHalfStart)} to ${formatDay(lastCompleteDay)} (${halfDays} days each)`,
	};
}

function buildSweepQueries(
	window: InvestigationWindow,
	lookbackDays: number
): SweepQuery[] {
	const ranges: Record<SweepRange, readonly [string, string]> = {
		all: [window.from, window.to],
		first: [window.h1From, window.h1To],
		second: [window.h2From, window.h2To],
	};
	return SWEEP_QUERY_SPECS.map(([label, type, range, fixedLimit]) => {
		const [from, to] = ranges[range];
		const daily = type === "events_by_date";
		return {
			label,
			type,
			from,
			to,
			...(daily ? { timeUnit: "day" as const } : {}),
			...(fixedLimit || daily
				? { limit: fixedLimit ?? Math.min(62, lookbackDays + 2) }
				: {}),
		};
	});
}

function queryRequest(query: SweepQuery, websiteId: string, timezone: string) {
	return {
		projectId: websiteId,
		type: query.type,
		from: query.from,
		to: query.to,
		timezone,
		...(query.timeUnit ? { timeUnit: query.timeUnit } : {}),
		...(query.limit ? { limit: query.limit } : {}),
	};
}

export function buildReceipts(params: {
	lookbackDays: number;
	now?: Date;
	timezone: string;
	websiteId: string;
}): InvestigationReceipts {
	const window = buildInvestigationWindow(
		params.lookbackDays,
		params.now,
		params.timezone
	);
	const queries = buildSweepQueries(window, params.lookbackDays);

	return {
		steps: 2,
		queriesRun: [
			...queries.map((query) => ({
				tool: query.type,
				input: JSON.stringify(
					queryRequest(query, params.websiteId, params.timezone)
				),
			})),
			{
				tool: "structured_memo_synthesis",
				input: JSON.stringify({
					source: "in_memory_analytics_sweep",
					queryOutputsPersisted: false,
				}),
			},
		],
		sourcesChecked: [...new Set(queries.map((query) => query.type))],
	};
}

function createSweepTimeoutError(): Error {
	const error = new Error("Investigation analytics sweep timed out");
	error.name = "AbortError";
	return error;
}

async function safeQuery(
	websiteId: string,
	domain: string,
	timezone: string,
	query: SweepQuery,
	abortSignal: AbortSignal
): Promise<Record<string, unknown>[] | null> {
	try {
		const rows = await executeQuery(
			queryRequest(query, websiteId, timezone),
			domain,
			timezone,
			abortSignal
		);
		return Array.isArray(rows) ? rows : [];
	} catch {
		if (abortSignal.aborted) {
			throw abortSignal.reason instanceof Error
				? abortSignal.reason
				: createSweepTimeoutError();
		}
		return null;
	}
}

function compactRows(rows: Record<string, unknown>[] | null, max = 25): string {
	if (rows === null) {
		return "(query failed — source unavailable; treat as unknown, not zero)";
	}
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
}): Promise<InvestigationSweep> {
	const window = buildInvestigationWindow(
		params.lookbackDays,
		params.now,
		params.timezone
	);
	const queries = buildSweepQueries(window, params.lookbackDays);
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(createSweepTimeoutError()),
		SWEEP_TIMEOUT_MS
	);

	try {
		const results = await Promise.all(
			queries.map((query) =>
				safeQuery(
					params.websiteId,
					params.websiteDomain,
					params.timezone,
					query,
					controller.signal
				)
			)
		);

		const sections = queries.flatMap((query, index) => [
			`### ${query.label}`,
			compactRows(
				results[index] ?? null,
				query.type === "events_by_date" ? params.lookbackDays + 2 : 25
			),
		]);

		return {
			complete: results.every((rows) => rows !== null),
			hasData: results.some((rows) =>
				rows?.some((row) =>
					Object.values(row).some((value) => {
						const number = Number(value);
						return Number.isFinite(number) && number !== 0;
					})
				)
			),
			text: [
				"## Bounded analytics sweep",
				`Timezone: ${params.timezone}. Last complete local day: ${window.to}.`,
				`Equal comparison windows: ${window.halves}.`,
				"Query results below are used in memory for this response and are not persisted by this tool.",
				"",
				...sections,
			].join("\n"),
		};
	} finally {
		clearTimeout(timeout);
	}
}

function receiptSummary(receipts: InvestigationReceipts): string {
	const sources = receipts.sourcesChecked.join(", ") || "none";
	return `${receipts.steps} pipeline steps, ${receipts.queriesRun.length} attempted operations (${sources}). Query outputs are not persisted by this tool.`;
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
		lines.push("", `Receipts: ${receiptSummary(receipts)}`);
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
			"## Observed sequence",
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

	sections.push("", "## Receipts", receiptSummary(receipts));

	return sections.join("\n");
}

export function buildFallbackMemo(detail = ""): InvestigationMemo {
	const narrative =
		detail.trim() ||
		"The analytics sweep ran, but the structured memo could not be synthesized. No cause was established; re-run before acting on this result.";
	return {
		headline: "Analytics review could not be synthesized.",
		narrative,
		causalChain: [],
		deadEnds: [],
		confidence: {
			level: "low",
			reason:
				"Structured synthesis was unavailable, so the available analytics were not converted into a verified finding.",
		},
		verdict: {
			type: "watch",
			reason: "No reliable conclusion is available from this run.",
		},
		actions: [],
	};
}

const MEMO_SYNTHESIS_SYSTEM = [
	"Turn the supplied bounded analytics sweep into one cautious structured memo.",
	"Use only facts present in the sweep. Never invent causes, deploys, dates, segments, revenue, or conversion impact.",
	"Treat a failed source as unknown, not zero. Treat an empty result as no rows returned, not proof that the metric is healthy.",
	"Compare only the two equal windows named in the prompt. The headline should include the most decision-relevant observed number.",
	"This sweep supports descriptive findings, not root-cause proof. Leave causalChain empty unless the supplied time series directly supports an ordered sequence, and never turn correlation into a causal mechanism.",
	"Confidence must be low or medium because no external causal evidence was gathered. Name the missing data that limits confidence.",
	"Use act only for a material observed reliability, revenue, or conversion problem with a safe concrete next check. Use watch for unexplained movement. Use all_clear only when primary sources succeeded and show no material issue.",
	"Actions must be cautious, reversible, and grounded in a named page, metric, event, referrer, or error surface. Do not recommend rollback, code changes, or broad strategy without direct evidence.",
].join(" ");

export interface RunInvestigationParams {
	apiKey: ApiKeyRow | null;
	billingMode?: "bill" | "skip";
	lookbackDays: number;
	question?: string;
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
	const userId = params.userId ?? params.apiKey?.userId ?? null;
	const organizationId = params.apiKey?.organizationId ?? null;
	const billingCustomerId =
		params.billingMode === "skip"
			? null
			: await resolveAgentBillingCustomerId({
					apiKey: params.apiKey,
					organizationId,
					userId,
				});
	if (
		params.billingMode !== "skip" &&
		!(await ensureAgentCreditsAvailable(billingCustomerId))
	) {
		throw new DatabuddyAgentUserError({
			code: "agent_credits_exhausted",
			message:
				"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset.",
		});
	}

	const timezone = params.timezone ?? "UTC";
	const now = new Date();
	const sweep = await runInvestigationSweep({
		lookbackDays: params.lookbackDays,
		now,
		timezone,
		websiteDomain: params.websiteDomain,
		websiteId: params.websiteId,
	});
	const receipts = buildReceipts({
		lookbackDays: params.lookbackDays,
		now,
		timezone,
		websiteId: params.websiteId,
	});
	const window = buildInvestigationWindow(params.lookbackDays, now, timezone);
	const prompt = [
		`Website: ${params.websiteId} (${params.websiteDomain}). Timezone: ${timezone}.`,
		`Compare exactly ${window.halves}; ${window.to} is the last complete day.`,
		params.question?.trim()
			? `User question: ${params.question.trim()}`
			: "Find the most material observed change, or report that none is supported.",
		"Do not infer deploys, intent, or root cause.",
		"",
		sweep.text,
	].join("\n");

	let memo: InvestigationMemo;
	try {
		const result = await generateObject({
			abortSignal: AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS),
			model: models.balanced,
			schema: investigationMemoSchema,
			system: MEMO_SYNTHESIS_SYSTEM,
			prompt,
		});
		memo = result.object;
		await trackAgentUsageAndBill({
			usage: result.usage,
			modelId: modelNames.balanced,
			source: "mcp",
			agentType: "investigate",
			billingCustomerId,
			organizationId,
			userId,
			websiteId: params.websiteId,
		});
	} catch {
		memo = buildFallbackMemo();
	}
	if (memo.verdict.type === "all_clear" && !(sweep.complete && sweep.hasData)) {
		memo = {
			...memo,
			headline: "The available data cannot support an all-clear.",
			narrative:
				"One or more sources were empty or unavailable, so this run cannot determine whether conditions are normal.",
			causalChain: [],
			deadEnds: [],
			confidence: {
				level: "low",
				reason:
					"The available sources cannot establish that the site is clear.",
			},
			verdict: {
				type: "watch",
				reason:
					"Data was missing or unavailable, so no all-clear is supported.",
			},
		};
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
			"Compare fixed analytics views for one website across two equal, complete time windows and return a cautious memo with confidence and operation receipts. Use for 'what changed?' or a bounded first pass on 'why did X change?'.",
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
					"Optional steering question, e.g. 'what changed in signups last week?'. Omit to find the most consequential observed change."
				),
			lookbackDays: z.number().int().min(7).max(60).optional().default(30),
			timezone: z
				.string()
				.refine((value) => Boolean(validateTimezone(value)), {
					message: "Invalid IANA timezone",
				})
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
				websiteId: ctx.websiteId as string,
				websiteDomain: ctx.websiteDomain ?? "unknown",
				question: input.question,
				lookbackDays: input.lookbackDays,
				timezone: input.timezone,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new McpToolError(
					"upstream_timeout",
					"The analytics sweep timed out. Try a shorter lookbackDays window.",
					{
						hint: "The bounded analytics queries exceeded their shared time budget.",
					}
				);
			}
			throw error;
		}
	}
);
