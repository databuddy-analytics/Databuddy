import { and, db, desc, eq, gte, lte } from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import type {
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import dayjs from "dayjs";
import type { InvestigationInput } from "./investigation";
import { type InsightDepth, MAX_INSIGHTS_PER_WEBSITE } from "./policy";

const RECENT_INSIGHTS_PROMPT_LIMIT = 12;

function promptLookbackDays(lookbackDays: number): number {
	return Math.max(14, Math.min(180, lookbackDays * 2));
}

export function historyStateSuffix(state: {
	hadResolvedHistory: boolean;
	recurrence: number;
	resolvedAt: Date | null;
	resolvedReason: "recovered" | "stale" | null;
	status: "open" | "resolved";
}): string {
	if (state.status === "resolved") {
		if (state.resolvedReason === "recovered") {
			return state.resolvedAt
				? ` (recovered ${dayjs(state.resolvedAt).format("YYYY-MM-DD")})`
				: " (recovered)";
		}
		return state.resolvedReason === "stale" ? " (went quiet)" : " (resolved)";
	}
	if (state.recurrence > 1) {
		return state.hadResolvedHistory
			? ` (intermittent, ${state.recurrence}x)`
			: ` (reported ${state.recurrence}x)`;
	}
	return "";
}

export async function fetchInsightHistory(
	organizationId: string,
	websiteId: string,
	lookbackDays: number,
	asOf: Date = new Date()
): Promise<string> {
	const since = dayjs(asOf)
		.subtract(promptLookbackDays(lookbackDays), "day")
		.toDate();
	const rows = await db
		.select({
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			severity: analyticsInsights.severity,
			rootCause: analyticsInsights.rootCause,
			changePercent: analyticsInsights.changePercent,
			subjectKey: analyticsInsights.subjectKey,
			createdAt: analyticsInsights.createdAt,
			status: analyticsInsights.status,
			resolvedReason: analyticsInsights.resolvedReason,
			resolvedAt: analyticsInsights.resolvedAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				eq(analyticsInsights.websiteId, websiteId),
				gte(analyticsInsights.createdAt, since),
				lte(analyticsInsights.createdAt, asOf)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt))
		.limit(50);

	if (rows.length === 0) {
		return "";
	}

	const subjectCounts = new Map<string, number>();
	const subjectHadResolved = new Set<string>();
	for (const row of rows) {
		const key = row.subjectKey || row.title;
		subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
		if (row.status === "resolved") {
			subjectHadResolved.add(key);
		}
	}

	const seen = new Set<string>();
	const lines: string[] = [];
	for (const row of rows) {
		if (lines.length >= RECENT_INSIGHTS_PROMPT_LIMIT) {
			break;
		}
		const key = row.subjectKey || row.title;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		const change =
			row.changePercent === null
				? ""
				: ` ${row.changePercent > 0 ? "+" : ""}${Math.round(row.changePercent)}%`;
		const suffix = historyStateSuffix({
			status: row.status,
			resolvedReason: row.resolvedReason,
			resolvedAt: row.resolvedAt,
			recurrence: subjectCounts.get(key) ?? 1,
			hadResolvedHistory: subjectHadResolved.has(key) && row.status === "open",
		});
		lines.push(
			`- [${row.severity}] ${row.title}${change}${suffix} (${dayjs(row.createdAt).format("YYYY-MM-DD")})`
		);
		if (row.description) {
			lines.push(`  ${row.description.slice(0, 150)}`);
		}
		if (row.rootCause) {
			lines.push(`  Cause: ${row.rootCause.slice(0, 100)}`);
		}
	}

	return `Previous findings (orientation only; not citable evidence):\n${lines.join("\n")}`;
}

const DEPTH_INSTRUCTIONS: Record<InsightDepth, string> = {
	surface: "Use the supplied evidence; query only a blocking gap.",
	investigated:
		"Cross-check one relevant context when it can change the action.",
	deep: "Cross-check each conclusion across the relevant evidence domains.",
};

export function buildSystemPrompt(investigationDepth: InsightDepth): string {
	return `You investigate analytics signals and return the next useful decision. ${DEPTH_INSTRUCTIONS[investigationDepth]}

For every listed signal, choose exactly one disposition:
- action_ready: evidence supports one specific action and a verification check.
- needs_context: a named missing fact blocks the decision; ask one answerable question.
- monitor: acting now is premature; give a measurable escalation condition and check date.
- not_a_problem: evidence explains why no action is warranted.

Rules:
- Backend signal fields are facts. Never rewrite identity, metrics, windows, severity, sentiment, type, or priority.
- Cite only evidence IDs owned by that signal. Failed evidence can support needs_context, never a conclusion.
- Do not claim a cause or impact unless cited evidence directly measures it.
- Query only a specific missing fact. Every data-tool call must include the signalKey.
- For z-score signals, query current only; the supplied detector evidence owns the sparse comparable-day baseline.
- Keep summaries plain and short. No filler, drama, jargon, or repeated metrics.
- Recommend; never mutate anything.
- Call submit_investigation with one terminal result for every signal. If rejected, correct it and resubmit. Do not finish with prose.`;
}

function formatSignal(signal: InvestigationSignal): string {
	const previous = signal.metric.previous ?? "n/a";
	const baseline = signal.detection.baselineDates
		? `comparable dates ${signal.detection.baselineDates.join(",")}`
		: `${signal.period.previous.from}..${signal.period.previous.to}`;
	return `- ${signal.signalKey} | ${signal.entity.type}:${signal.entity.label} | ${signal.metric.label}=${signal.metric.current} vs ${previous} (${signal.changePercent ?? "n/a"}%) | ${signal.period.current.from}..${signal.period.current.to} vs ${baseline} | ${signal.severity}, ${signal.sentiment}, priority ${signal.priority} | ${signal.detection.reason}`;
}

function formatEvidence(evidence: InvestigationEvidence): string {
	const detail =
		evidence.status === "failed" ? evidence.error : evidence.summary;
	const metrics =
		evidence.status !== "failed" &&
		evidence.status !== "empty" &&
		evidence.metrics?.length
			? ` | metrics=${JSON.stringify(evidence.metrics)}`
			: "";
	const range = evidence.comparison
		? `${evidence.comparison.current.from}..${evidence.comparison.current.to} vs ${evidence.comparison.previous.from}..${evidence.comparison.previous.to}`
		: evidence.range
			? `${evidence.range.from}..${evidence.range.to}`
			: evidence.period;
	const entity = evidence.entity
		? ` | entity=${evidence.entity.type}:${evidence.entity.id}`
		: "";
	return `- ${evidence.evidenceId} | signal=${evidence.signalKey}${entity} | ${evidence.source}.${evidence.queryType} | ${range} | ${evidence.status}, rows=${evidence.rowCount} | ${detail}${metrics}`;
}

export function buildInvestigationPrompt(
	investigation: InvestigationInput,
	params: {
		domain: string;
		historyBlock: string;
		siteContext: string;
		timezone: string;
	}
): string {
	const orientation = [
		params.siteContext
			? `Product description (orientation only; not evidence):\n${params.siteContext}`
			: "",
		params.historyBlock,
	]
		.filter(Boolean)
		.join("\n\n");

	return `Investigate ${investigation.signals.length} signals for ${params.domain} (${params.timezone}). Return no more than ${MAX_INSIGHTS_PER_WEBSITE} action-ready or needs-context findings.

SIGNALS
${investigation.signals.map(formatSignal).join("\n")}

EVIDENCE
${investigation.evidence.map(formatEvidence).join("\n")}

Use supplied evidence first. If it does not settle the disposition, query only the missing fact and cite the returned evidence ID.
${orientation ? `\nORIENTATION\n${orientation}` : ""}`;
}
