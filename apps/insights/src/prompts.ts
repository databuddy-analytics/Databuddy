import type { WeekOverWeekPeriod } from "@databuddy/ai/insights/types";
import { and, db, desc, eq, gte, isNull } from "@databuddy/db";
import {
	analyticsInsights,
	annotations,
	type InsightGenerationConfigSnapshot,
	insightUserFeedback,
} from "@databuddy/db/schema";
import dayjs from "dayjs";
import type { EnrichedSignal } from "./enrichment";

const RECENT_INSIGHTS_PROMPT_LIMIT = 12;

export function promptLookbackDays(
	config: InsightGenerationConfigSnapshot
): number {
	return Math.max(14, Math.min(180, config.lookbackDays * 2));
}

export async function fetchRecentAnnotations(
	websiteId: string,
	config: InsightGenerationConfigSnapshot
): Promise<string> {
	const since = dayjs().subtract(promptLookbackDays(config), "day").toDate();
	const rows = await db
		.select({
			text: annotations.text,
			xValue: annotations.xValue,
			tags: annotations.tags,
		})
		.from(annotations)
		.where(
			and(
				eq(annotations.websiteId, websiteId),
				gte(annotations.xValue, since),
				isNull(annotations.deletedAt)
			)
		)
		.orderBy(annotations.xValue)
		.limit(20);

	if (rows.length === 0) {
		return "";
	}

	const lines = rows.map((row) => {
		const date = dayjs(row.xValue).format("YYYY-MM-DD");
		const tags = row.tags?.length ? ` [${row.tags.join(", ")}]` : "";
		return `- ${date}: ${row.text}${tags}`;
	});

	return `\n\nUser annotations (known events that may explain changes):\n${lines.join("\n")}`;
}

export async function fetchDismissedPatterns(
	organizationId: string,
	websiteId: string
): Promise<string> {
	const since = dayjs().subtract(30, "day").toDate();
	const rows = await db
		.select({
			title: analyticsInsights.title,
			type: analyticsInsights.type,
		})
		.from(insightUserFeedback)
		.innerJoin(
			analyticsInsights,
			eq(insightUserFeedback.insightId, analyticsInsights.id)
		)
		.where(
			and(
				eq(insightUserFeedback.organizationId, organizationId),
				eq(analyticsInsights.websiteId, websiteId),
				eq(insightUserFeedback.vote, "down"),
				gte(insightUserFeedback.createdAt, since)
			)
		)
		.orderBy(desc(insightUserFeedback.createdAt))
		.limit(10);

	if (rows.length === 0) {
		return "";
	}

	const lines = rows.map((r) => `- [${r.type}] ${r.title}`);
	return `\n\nInsights users marked as NOT helpful (avoid similar narratives):\n${lines.join("\n")}`;
}

export async function fetchInsightHistory(
	organizationId: string,
	websiteId: string,
	config: InsightGenerationConfigSnapshot
): Promise<string> {
	const since = dayjs().subtract(promptLookbackDays(config), "day").toDate();
	const rows = await db
		.select({
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			severity: analyticsInsights.severity,
			rootCause: analyticsInsights.rootCause,
			changePercent: analyticsInsights.changePercent,
			subjectKey: analyticsInsights.subjectKey,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				eq(analyticsInsights.websiteId, websiteId),
				gte(analyticsInsights.createdAt, since)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt))
		.limit(50);

	if (rows.length === 0) {
		return "";
	}

	const subjectCounts = new Map<string, number>();
	for (const row of rows) {
		const key = row.subjectKey || row.title;
		subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
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

		const date = dayjs(row.createdAt).format("YYYY-MM-DD");
		const recurrence = subjectCounts.get(key) ?? 1;
		const recurring = recurrence > 1 ? ` (reported ${recurrence}x)` : "";
		const change =
			row.changePercent === null
				? ""
				: ` ${row.changePercent > 0 ? "+" : ""}${Math.round(row.changePercent)}%`;

		lines.push(
			`- [${row.severity}] ${row.title}${change}${recurring} (${date})`
		);
		if (row.description) {
			lines.push(`  ${row.description.slice(0, 150)}`);
		}
		if (row.rootCause) {
			lines.push(`  Cause: ${row.rootCause.slice(0, 100)}`);
		}
	}

	return `\n\nPrevious findings for this site (compare against current data — note what resolved, worsened, or persists):
${lines.join("\n")}`;
}

export interface OrgWebsiteRow {
	domain: string;
	id: string;
	name: string | null;
}

export function formatOrgWebsitesContext(
	orgSites: OrgWebsiteRow[],
	currentWebsiteId: string
): string {
	if (orgSites.length <= 1) {
		return "";
	}

	const sorted = [...orgSites].sort((a, b) =>
		a.domain.localeCompare(b.domain, "en")
	);
	const lines = sorted.map((site) => {
		const label = site.name?.trim() ? site.name.trim() : site.domain;
		const marker =
			site.id === currentWebsiteId
				? " - metrics below are for this site only"
				: "";
		return `- ${label} (${site.domain})${marker}`;
	});
	return `## Organization websites\n${lines.join("\n")}\n\n`;
}

export function buildSystemPrompt(
	config: InsightGenerationConfigSnapshot,
	options?: { investigationMode?: boolean }
): string {
	const targetCount = Math.max(
		1,
		Math.min(10, config.maxInsightsPerWebsite ?? 2)
	);
	const depthInstruction =
		config.depth === "light"
			? "Use the smallest useful tool set. Prefer 1-2 high-confidence insights."
			: config.depth === "deep"
				? "Actively cross-check web, product, ops, and business context."
				: "Explore enough context for concise, distinct, high-confidence insights.";

	return `You are an analytics investigator. Return up to ${targetCount} insights ranked by business impact. ${depthInstruction}

RULES:
- Titles: outcome-first, plain language, ≤80 chars. No hedging, no jargon (INP, LCP, TTFB, CLS, p75).
- Title direction MUST match the primary metric. Mismatches are rejected.
- Only report signals that change what someone does today. Silence > noise.
- Suggestions: name the exact page, button, or query. Never say "monitor" or "watch".
- ZERO REPETITION: title = what. description = so what (≤300 chars). rootCause = why. evidence = new facts only. suggestion = one action (≤300 chars).
- Metrics: only verified numbers. Label segment-specific values clearly.
- Low traffic (<50 sessions/week): no percentage claims on <10 absolute values.
- Tools: batch queries in web_metrics (up to 8). search_console for keywords. summary_metrics for headline numbers.
- Confidence > 0.7 requires segment isolation or temporal correlation.
- Actions: include when fixable (fix_goal, add_custom_event, create_annotation, create_funnel, add_tracking, investigate_further, code_fix).
- code_fix: when you find a bug with a clear fix, emit a code_fix action with params {prompt, file_hint, error_message}. The prompt should be paste-ready for Cursor or Claude Code — include the exact file to change, what to change, and why.
- You have mutation tools: call create_annotation directly to mark deploys or incidents on the timeline. Call update_goal to fix goal target mismatches. Use confirmed=true to execute.${
		options?.investigationMode
			? "\n- Investigate detected signals using tools. Call emit_insight for each finding. Drop noise."
			: ""
	}`;
}

export function formatSignalBlock(
	signal: EnrichedSignal,
	index: number
): string {
	const dir = signal.direction === "up" ? "+" : "-";
	const scope =
		signal.method === "zscore"
			? `z=${signal.zScore}, latest day vs baseline`
			: "WoW";
	const parts = [
		`${index + 1}. ${signal.label} ${dir}${Math.abs(signal.deltaPercent).toFixed(0)}% (${scope}, ${signal.severity}) — ${signal.current.toLocaleString()} vs ${signal.baseline.toLocaleString()}`,
	];

	for (const seg of signal.segments) {
		parts.push(
			`  ${seg.dimension}: ${seg.topMovers.map((m) => `${m.name} ${m.deltaPercent > 0 ? "+" : ""}${m.deltaPercent}%`).join(", ")}`
		);
	}

	if (signal.errorContext) {
		const ec = signal.errorContext;
		parts.push(
			`  errors: ${ec.totalErrorsPrevious}->${ec.totalErrorsCurrent} (${ec.deltaPercent > 0 ? "+" : ""}${ec.deltaPercent}%)`
		);
		if (ec.topNewErrors.length > 0) {
			parts.push(`  new: ${ec.topNewErrors.join(", ")}`);
		}
	}

	if (signal.vitalsContext) {
		const vitals = signal.vitalsContext.metrics
			.map(
				(m) =>
					`${m.name} p75: ${m.previousP75}→${m.currentP75} (${m.deltaPercent > 0 ? "+" : ""}${m.deltaPercent}%)`
			)
			.join(", ");
		parts.push(`  vitals: ${vitals}`);
	}

	for (const a of signal.annotations) {
		parts.push(`  [${a.date}] ${a.title}`);
	}

	if (signal.githubContext) {
		const gc = signal.githubContext;
		for (const c of gc.commits.slice(0, 3)) {
			parts.push(`  ${c.sha} ${c.message} (${c.date?.slice(0, 10)})`);
		}
		for (const pr of gc.recentPRs.slice(0, 3)) {
			parts.push(
				`  PR#${pr.number} ${pr.title} (${pr.mergedAt?.slice(0, 10)})`
			);
		}
	}

	return parts.join("\n");
}

export function buildInvestigationPrompt(
	enrichedSignals: EnrichedSignal[],
	params: {
		annotationContext: string;
		dismissedBlock: string;
		domain: string;
		githubRepo?: { owner: string; repo: string };
		orgContext: string;
		period: WeekOverWeekPeriod;
		historyBlock: string;
		siteContext: string;
		timezone: string;
	}
): string {
	const { domain, period, timezone } = params;
	const signalBlocks = enrichedSignals
		.map((signal, i) => formatSignalBlock(signal, i))
		.join("\n\n");

	const githubInstruction = params.githubRepo
		? `2. github_commits for ${params.githubRepo.owner}/${params.githubRepo.repo} with dates matching the anomaly window.`
		: "2. If GitHub tools are available, check commits matching the anomaly window.";

	return `Investigating ${enrichedSignals.length} anomalies on ${domain}.
Period: ${period.current.from} to ${period.current.to} vs ${period.previous.from} to ${period.previous.to} (${timezone})
${params.siteContext}

SIGNALS:

${signalBlocks}

STRATEGY:
1. web_metrics period="both" to confirm signals and get segment breakdowns. Batch queries.
${githubInstruction}
3. search_console for keyword/page changes between periods.
4. For errors: get messages and affected pages. Scrape the page if needed.
5. For conversion/funnel changes: check product_metrics for funnel/goal data.
6. For user behavior: use interesting_sessions or session_list to find specific sessions that dropped off, then session_events to see what they did.
7. When you find something fixable, execute it: call create_annotation to mark deploys, update_goal to fix targets. Use confirmed=true.
8. Emit findings via emit_insight as you go.

summary_metrics is the canonical source for headline numbers.
${params.orgContext}${params.annotationContext}${params.historyBlock}${params.dismissedBlock}`;
}
