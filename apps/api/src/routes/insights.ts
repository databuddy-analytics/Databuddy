import { auth } from "@databuddy/auth";
import {
	analyticsInsights,
	and,
	annotations,
	db,
	desc,
	eq,
	gte,
	inArray,
	insightUserFeedback,
	isNull,
	member,
	websites,
} from "@databuddy/db";
import { cacheable, getRedisCache } from "@databuddy/redis";
import { getRateLimitHeaders, rateLimit } from "@databuddy/redis/rate-limit";
import { generateText, Output, stepCountIs, ToolLoopAgent } from "ai";
import dayjs from "dayjs";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { models } from "../ai/config/models";
import type { ParsedInsight } from "../ai/schemas/smart-insights-output";
import { insightsOutputSchema } from "../ai/schemas/smart-insights-output";
import { createInsightsAgentTools } from "../ai/tools/insights-agent-tools";
import { storeAnalyticsSummary } from "../lib/supermemory";
import { captureError, mergeWideEvent } from "../lib/tracing";
import { executeQuery } from "../query";

const CACHE_TTL = 900;
const CACHE_KEY_PREFIX = "ai-insights";
const TIMEOUT_MS = 60_000;
const INSIGHTS_AGENT_MAX_STEPS = 24;
const INSIGHTS_AGENT_TIMEOUT_MS = 120_000;
const QUERY_FETCH_TIMEOUT_MS = 45_000;
const MAX_WEBSITES = 5;
const CONCURRENCY = 3;
const GENERATION_COOLDOWN_HOURS = 6;
const RECENT_INSIGHTS_LOOKBACK_DAYS = 14;
const RECENT_INSIGHTS_PROMPT_LIMIT = 12;

const PATH_SEGMENT_ALNUM = /^[a-zA-Z0-9_-]+$/;
const DIGIT_CLASS = /\d/;
const LETTER_CLASS = /[a-zA-Z]/;
const LOWER_CLASS = /[a-z]/;
const UPPER_CLASS = /[A-Z]/;
const DASH_UNDERSCORE_SPLIT = /[-_]/g;

interface WebsiteInsight extends ParsedInsight {
	id: string;
	link: string;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

interface InsightMetricRow {
	current: number;
	format: "number" | "percent" | "duration_ms" | "duration_s";
	label: string;
	previous?: number;
}

interface InsightsPayload {
	insights: WebsiteInsight[];
	source: "ai" | "fallback";
}

interface PeriodData {
	browsers: Record<string, unknown>[];
	countries: Record<string, unknown>[];
	errorSummary: Record<string, unknown>[];
	summary: Record<string, unknown>[];
	topPages: Record<string, unknown>[];
	topReferrers: Record<string, unknown>[];
	vitalsOverview: Record<string, unknown>[];
}

interface WeekOverWeekPeriod {
	current: { from: string; to: string };
	previous: { from: string; to: string };
}

interface OrgWebsiteRow {
	domain: string;
	id: string;
	name: string | null;
}

function humanizeMetricKey(key: string): string {
	return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(2);
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

function formatObjectLine(record: Record<string, unknown>): string {
	return Object.entries(record)
		.filter(([, v]) => v !== null && v !== undefined)
		.map(([k, v]) => `${humanizeMetricKey(k)}: ${formatMetricValue(v)}`)
		.join(" | ");
}

function formatRowsBlock(
	rows: Record<string, unknown>[],
	sectionTitle: string
): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => formatObjectLine(row));
	return `### ${sectionTitle}\n${lines.join("\n")}`;
}

function isOpaquePathSegment(segment: string): boolean {
	if (segment.length < 8) {
		return false;
	}
	if (!PATH_SEGMENT_ALNUM.test(segment)) {
		return false;
	}
	const hasDigit = DIGIT_CLASS.test(segment);
	const hasLetter = LETTER_CLASS.test(segment);
	if (segment.length >= 16) {
		return hasLetter || hasDigit;
	}
	return hasDigit || (LOWER_CLASS.test(segment) && UPPER_CLASS.test(segment));
}

function titleCasePathWords(segment: string): string {
	return segment
		.replaceAll(DASH_UNDERSCORE_SPLIT, " ")
		.split(" ")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
}

/** Readable page name for titles; raw path may still appear in data rows for accuracy. */
function humanizePagePathForPrompt(rawPath: string): string {
	const path = rawPath.trim() || "/";
	if (path === "/" || path === "") {
		return "Home";
	}
	const segments = path.split("/").filter(Boolean);
	const last = segments.at(-1) ?? "";
	if (isOpaquePathSegment(last) && segments.length >= 2) {
		const parent = segments.at(-2) ?? "";
		if (parent && !isOpaquePathSegment(parent)) {
			return `${titleCasePathWords(parent)} page`;
		}
		return "Page";
	}
	if (isOpaquePathSegment(last)) {
		return "Page";
	}
	return `${titleCasePathWords(last)} page`;
}

function formatTopPagesBlock(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => {
		const rawName =
			typeof row.name === "string" ? row.name : String(row.name ?? "");
		const human = humanizePagePathForPrompt(rawName);
		const base = formatObjectLine(row);
		return `${base} | Human label (use in titles, not raw paths with IDs): ${human}`;
	});
	return `### Top Pages\n${lines.join("\n")}`;
}

function directionKeyFromParts(
	changePercent: number | null | undefined,
	sentiment: ParsedInsight["sentiment"]
): "up" | "down" | "flat" {
	if (
		changePercent !== null &&
		changePercent !== undefined &&
		changePercent !== 0
	) {
		return changePercent > 0 ? "up" : "down";
	}
	if (sentiment === "positive") {
		return "up";
	}
	if (sentiment === "negative") {
		return "down";
	}
	return "flat";
}

function insightDedupeKey(
	websiteId: string,
	type: ParsedInsight["type"],
	sentiment: ParsedInsight["sentiment"],
	changePercent: number | null | undefined
): string {
	const dir = directionKeyFromParts(changePercent, sentiment);
	return `${websiteId}|${type}|${dir}`;
}

async function fetchInsightDedupeKeyToIdMap(
	organizationId: string
): Promise<Map<string, string>> {
	const cutoff = dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate();
	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt));
	const map = new Map<string, string>();
	for (const r of rows) {
		const key = insightDedupeKey(
			r.websiteId,
			r.type as ParsedInsight["type"],
			r.sentiment as ParsedInsight["sentiment"],
			r.changePercent
		);
		if (!map.has(key)) {
			map.set(key, r.id);
		}
	}
	return map;
}

function runQueryWithTimeout<T>(
	label: string,
	fn: () => Promise<T>
): Promise<T> {
	return Promise.race([
		fn(),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, QUERY_FETCH_TIMEOUT_MS);
		}),
	]);
}

function getWeekOverWeekPeriod(): WeekOverWeekPeriod {
	const now = dayjs();
	return {
		current: {
			from: now.subtract(7, "day").format("YYYY-MM-DD"),
			to: now.format("YYYY-MM-DD"),
		},
		previous: {
			from: now.subtract(14, "day").format("YYYY-MM-DD"),
			to: now.subtract(7, "day").format("YYYY-MM-DD"),
		},
	};
}

async function fetchPeriodData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<PeriodData> {
	const base = { projectId: websiteId, from, to, timezone };

	const safe = async (
		label: string,
		run: () => Promise<Record<string, unknown>[]>
	): Promise<Record<string, unknown>[]> => {
		try {
			const value = await runQueryWithTimeout(label, run);
			return Array.isArray(value) ? value : [];
		} catch (error) {
			useLogger().warn("Insights period query failed or timed out", {
				insights: { websiteId, label, error },
			});
			return [];
		}
	};

	const [
		summary,
		topPages,
		errorSummary,
		topReferrers,
		countries,
		browsers,
		vitalsOverview,
	] = await Promise.all([
		safe("summary_metrics", () =>
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone)
		),
		safe("top_pages", () =>
			executeQuery({ ...base, type: "top_pages", limit: 10 }, domain, timezone)
		),
		safe("error_summary", () =>
			executeQuery({ ...base, type: "error_summary" }, domain, timezone)
		),
		safe("top_referrers", () =>
			executeQuery(
				{ ...base, type: "top_referrers", limit: 10 },
				domain,
				timezone
			)
		),
		safe("country", () =>
			executeQuery({ ...base, type: "country", limit: 8 }, domain, timezone)
		),
		safe("browser_name", () =>
			executeQuery(
				{ ...base, type: "browser_name", limit: 8 },
				domain,
				timezone
			)
		),
		safe("vitals_overview", () =>
			executeQuery({ ...base, type: "vitals_overview" }, domain, timezone)
		),
	]);

	return {
		summary,
		topPages,
		errorSummary,
		topReferrers,
		countries,
		browsers,
		vitalsOverview,
	};
}

async function checkHasInsightData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<boolean> {
	const base = { projectId: websiteId, from, to, timezone };
	const safe = async (
		label: string,
		run: () => Promise<Record<string, unknown>[]>
	): Promise<Record<string, unknown>[]> => {
		try {
			const value = await runQueryWithTimeout(label, run);
			return Array.isArray(value) ? value : [];
		} catch {
			return [];
		}
	};
	const [summary, topPages] = await Promise.all([
		safe("summary_metrics", () =>
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone)
		),
		safe("top_pages", () =>
			executeQuery({ ...base, type: "top_pages", limit: 1 }, domain, timezone)
		),
	]);
	return summary.length > 0 || topPages.length > 0;
}

function formatDataForPrompt(
	current: PeriodData,
	previous: PeriodData,
	currentRange: { from: string; to: string },
	previousRange: { from: string; to: string }
): string {
	const sections: string[] = [];

	sections.push(
		`## Current Period (${currentRange.from} to ${currentRange.to})`
	);
	sections.push(formatRowsBlock(current.summary, "Summary"));
	if (current.topPages.length > 0) {
		sections.push(formatTopPagesBlock(current.topPages));
	}
	if (current.errorSummary.length > 0) {
		sections.push(formatRowsBlock(current.errorSummary, "Errors"));
	}
	if (current.topReferrers.length > 0) {
		sections.push(formatRowsBlock(current.topReferrers, "Top Referrers"));
	}
	if (current.countries.length > 0) {
		sections.push(
			formatRowsBlock(current.countries, "Countries (by visitors)")
		);
	}
	if (current.browsers.length > 0) {
		sections.push(formatRowsBlock(current.browsers, "Browsers (by visitors)"));
	}
	if (current.vitalsOverview.length > 0) {
		sections.push(
			formatRowsBlock(
				current.vitalsOverview,
				"Web Vitals (p75 and samples; use for performance insights when samples are meaningful)"
			)
		);
	}

	sections.push(
		`\n## Previous Period (${previousRange.from} to ${previousRange.to})`
	);
	sections.push(formatRowsBlock(previous.summary, "Summary"));
	if (previous.topPages.length > 0) {
		sections.push(formatTopPagesBlock(previous.topPages));
	}
	if (previous.errorSummary.length > 0) {
		sections.push(formatRowsBlock(previous.errorSummary, "Errors"));
	}
	if (previous.topReferrers.length > 0) {
		sections.push(formatRowsBlock(previous.topReferrers, "Top Referrers"));
	}
	if (previous.countries.length > 0) {
		sections.push(
			formatRowsBlock(previous.countries, "Countries (by visitors)")
		);
	}
	if (previous.browsers.length > 0) {
		sections.push(formatRowsBlock(previous.browsers, "Browsers (by visitors)"));
	}
	if (previous.vitalsOverview.length > 0) {
		sections.push(
			formatRowsBlock(
				previous.vitalsOverview,
				"Web Vitals (p75 and samples; use for performance insights when samples are meaningful)"
			)
		);
	}

	return sections.filter(Boolean).join("\n\n");
}

async function fetchRecentAnnotations(websiteId: string): Promise<string> {
	const since = dayjs().subtract(14, "day").toDate();

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

	const lines = rows.map((r) => {
		const date = dayjs(r.xValue).format("YYYY-MM-DD");
		const tags = r.tags?.length ? ` [${r.tags.join(", ")}]` : "";
		return `- ${date}: ${r.text}${tags}`;
	});

	return `\n\nUser annotations (known events that may explain changes):\n${lines.join("\n")}`;
}

async function fetchRecentInsightsForPrompt(
	organizationId: string,
	websiteId: string
): Promise<string> {
	const since = dayjs().subtract(RECENT_INSIGHTS_LOOKBACK_DAYS, "day").toDate();

	const rows = await db
		.select({
			title: analyticsInsights.title,
			type: analyticsInsights.type,
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
		.limit(RECENT_INSIGHTS_PROMPT_LIMIT);

	if (rows.length === 0) {
		return "";
	}

	const lines = rows.map(
		(r) =>
			`- [${r.type}] ${r.title} (${dayjs(r.createdAt).format("YYYY-MM-DD")})`
	);

	return `\n\n## Recently reported insights for this website (avoid repeating the same narrative unless something materially changed)\n${lines.join("\n")}`;
}

function formatOrgWebsitesContext(
	orgSites: OrgWebsiteRow[],
	currentWebsiteId: string
): string {
	if (orgSites.length <= 1) {
		return "";
	}
	const sorted = [...orgSites].sort((a, b) =>
		a.domain.localeCompare(b.domain, "en")
	);
	const lines = sorted.map((s) => {
		const label = s.name?.trim() ? s.name.trim() : s.domain;
		const marker =
			s.id === currentWebsiteId
				? " — **metrics below are for this site only**"
				: "";
		return `- ${label} (${s.domain})${marker}`;
	});
	return `## Organization websites (same account, separate analytics)
Each row is a different tracked property (e.g. marketing site vs app vs docs). The week-over-week metrics in this message apply only to the site marked "metrics below". Do not blend numbers across rows. If referrers include another domain from this list, treat it as cross-property traffic (e.g. landing → product) and name both sides clearly.

${lines.join("\n")}

`;
}

const INSIGHTS_SYSTEM_PROMPT = `You are an analytics insights engine. Your job is to find the 1-3 most significant findings from week-over-week website data, written like an analyst: descriptive where needed, but every insight MUST include a prescriptive "so what / now what" in the suggestion field.

Priority scoring (priority 1-10):
- Score by actionability × business impact, NOT by how large the percentage move is. Traffic spikes without conversion or outcome context are lower priority than errors, session/engagement collapses, or clear negative trends affecting users.
- Operational health (errors, reliability) often matters more than vanity traffic growth. A moderate error-rate improvement during high traffic can be high value.
- Do not assign 8-10 to pure volume spikes unless the data also shows a linked risk or opportunity worth acting on.

Significance thresholds (for what to mention):
- Traffic (pageviews/visitors/sessions): <5% change = only mention if nothing else notable. 5-15% = worth noting. >15% = significant. >30% = notable volume change.
- Errors: new error types = always report. Error rate up >0.5% = warning. Error rate up >2% = critical.
- Bounce rate: change >5 percentage points = notable.
- Pages: new page entering top 10 or page dropping out = notable. Individual page change >25% = significant.
- Referrers: new source appearing or major source declining >20% = notable.

Anti-redundancy:
- If the user message includes a "Recently reported insights" section, treat those as already surfaced. Do NOT output a new insight that tells the same story (same underlying signal and direction) unless the narrative would be materially different (e.g. new root cause, reversal, or threshold crossed). Prefer novel angles or omit.

Data boundaries:
- Only use metrics returned from your insight_query tool results (and annotations / recently reported insights in the user message). Do not invent funnel conversion rates, MRR, revenue, cohort retention, or signup counts unless they appear in the data.
- If conversion or goal data appears in summary_metrics, you may connect traffic to outcomes. If absent, do not fabricate funnel or revenue insights.

Multi-property organizations:
- When the user message includes "Organization websites", each bullet is a separate site in the same account. Titles and descriptions MUST name which property (domain or product label from the list) the insight applies to—do not assume the reader knows which site is "app" vs marketing.
- Referrers that appear as another domain in that list are cross-site traffic: explain the relationship (e.g. www → app) instead of treating them like generic external referrers.

Cross-dimension depth (when Countries, Browsers, or Web Vitals sections appear):
- Prefer at least one insight that connects two data domains when the numbers support it (e.g. summary traffic trend + a major country or browser share shift; or bounce/session signals + a vitals regression). Single-metric stories are fine when nothing else stands out.
- For geography: compare week-over-week visitor share or rank changes for named countries—call out a country that moved materially even if sitewide traffic looks flat.
- For browsers: note a browser gaining or losing meaningful share of visitors; relate to errors or vitals only when those sections align.
- For Web Vitals: use metric rows with non-trivial sample counts. Compare p75 between periods for LCP, INP, CLS, FCP when present. Tie performance language to user impact (load responsiveness, layout stability)—do not invent vitals that are missing from the data.

Suggestion field (required quality):
- Must answer "what should we do next?" in one or two sentences. Reference metric labels (e.g. "Contact Page Visitors", "Bounce Rate") but do NOT restate the values — those are in the metrics array. This is an analytics product—avoid generic marketing coaching.
- Bad: "Monitor traffic", "Keep an eye on this", "the 199 visitors compared to the 294 visitors" (number repetition).
- Good: tie to pages, channels, CTAs, error classes, or experiments by label. "Audit CTAs on Pricing Page to drive traffic toward Contact Page given the visitor disparity."

Titles and page paths:
- Never put raw URL paths with opaque ID segments in the title (no long random slugs). Use the Human label from Top Pages (e.g. "Demo page", "Pricing page").

Balanced weeks (mostly positive metrics):
- Still surface at least one insight that highlights a downside risk or watch item when the data supports it: e.g. median session duration down, bounce up, errors up in absolute count, heavy reliance on one volatile referrer or channel. If you only report wins when those signals exist, you are failing the user.

Metrics array (required):
- Every insight MUST include a "metrics" array of 1-5 data points that back the narrative.
- The first metric should be the primary one the insight is about (e.g. Visitors, Error Rate, Bounce Rate).
- Add supporting metrics that give context (e.g. alongside a traffic insight, include Sessions or Bounce Rate).
- Use the correct format: "number" for counts, "percent" for rates/percentages, "duration_ms" for millisecond timings (LCP, INP, FCP), "duration_s" for second-based durations.
- Both "current" and "previous" must come directly from the data. Omit "previous" only when comparison data is missing.

Separation of numbers and narrative (critical):
- The metrics array is the SINGLE SOURCE OF TRUTH for numbers. The UI shows metrics as structured data chips.
- The description MUST NOT restate values already in the metrics array. Instead, reference metrics by their label name (e.g. "Contact Page Visitors dropped sharply" not "visitors fell from 352 to 199"). Focus description on the WHY: causes, implications, context, and connections between metrics.
- The suggestion MUST NOT restate metric values either. Reference labels and recommend a specific action grounded in the pattern.
- The title MAY include the primary number or percentage for scannability (e.g. "Contact page visitors down 43%").

Rules:
- If annotations explain a change, mention it but still populate the metrics array.
- If everything is stable, return ONE positive/neutral insight (e.g. "Steady at 2,400 weekly visitors") with a light suggestion if appropriate.
- Never fabricate or round numbers beyond what's in the data`;

async function analyzeWebsiteLegacy(
	organizationId: string,
	userId: string,
	websiteId: string,
	domain: string,
	timezone: string,
	period: WeekOverWeekPeriod,
	orgSites: OrgWebsiteRow[],
	annotationContext: string,
	recentInsightsBlock: string
): Promise<ParsedInsight[]> {
	const currentRange = period.current;
	const previousRange = period.previous;

	const [current, previous] = await Promise.all([
		fetchPeriodData(
			websiteId,
			domain,
			currentRange.from,
			currentRange.to,
			timezone
		),
		fetchPeriodData(
			websiteId,
			domain,
			previousRange.from,
			previousRange.to,
			timezone
		),
	]);

	const hasData = current.summary.length > 0 || current.topPages.length > 0;
	if (!hasData) {
		return [];
	}

	const dataSection = formatDataForPrompt(
		current,
		previous,
		currentRange,
		previousRange
	);

	const orgContext = formatOrgWebsitesContext(orgSites, websiteId);
	const prompt = `Analyze this website's week-over-week data and return insights.\n\n${orgContext}${dataSection}${annotationContext}${recentInsightsBlock}`;

	try {
		const result = await generateText({
			model: models.analytics,
			output: Output.object({ schema: insightsOutputSchema }),
			system: INSIGHTS_SYSTEM_PROMPT,
			prompt,
			temperature: 0.2,
			maxOutputTokens: 8192,
			abortSignal: AbortSignal.timeout(TIMEOUT_MS),
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.analyze_website",
				metadata: {
					source: "insights",
					feature: "smart_insights",
					mode: "legacy_fallback",
					organizationId,
					userId,
					websiteId,
					websiteDomain: domain,
					timezone,
				},
			},
		});

		if (!result.output) {
			useLogger().warn("No structured output from insights model (legacy)", {
				insights: { websiteId },
			});
			return [];
		}

		return result.output.insights;
	} catch (error) {
		useLogger().warn("Failed to generate insights (legacy)", {
			insights: { websiteId, error },
		});
		return [];
	}
}

async function analyzeWebsite(
	organizationId: string,
	userId: string,
	websiteId: string,
	domain: string,
	timezone: string,
	period: WeekOverWeekPeriod,
	orgSites: OrgWebsiteRow[]
): Promise<ParsedInsight[]> {
	const currentRange = period.current;
	const previousRange = period.previous;

	const hasData = await checkHasInsightData(
		websiteId,
		domain,
		currentRange.from,
		currentRange.to,
		timezone
	);
	if (!hasData) {
		return [];
	}

	const [annotationContext, recentInsightsBlock] = await Promise.all([
		fetchRecentAnnotations(websiteId),
		fetchRecentInsightsForPrompt(organizationId, websiteId),
	]);

	const orgContext = formatOrgWebsitesContext(orgSites, websiteId);
	const userPrompt = `Analyze this website's week-over-week data and produce insights.

**Current period:** ${currentRange.from} to ${currentRange.to}
**Previous period:** ${previousRange.from} to ${previousRange.to}
**Timezone:** ${timezone}
**Domain:** ${domain}

Use insight_query to pull metrics for **both** current and previous periods before inferring trends. When ready, call submit_insights once with 1-3 insights.

${orgContext}${annotationContext}${recentInsightsBlock}`;

	const insightsToolWorkflow = `

## Tool workflow (required)
1. Start with insight_query for summary_metrics for **both** current and previous periods.
2. Add top_pages, error_summary, top_referrers, and cross-dimension data (country, browser_name, vitals_overview, custom_events_*) as needed to support conclusions.
3. When you have concrete week-over-week comparisons grounded in tool results, call **submit_insights** exactly once with 1-3 insights. You must call submit_insights to complete the task.`;

	const { tools, getSubmittedInsights } = createInsightsAgentTools({
		websiteId,
		domain,
		timezone,
		periodBounds: { current: currentRange, previous: previousRange },
	});

	try {
		const agent = new ToolLoopAgent({
			model: models.analytics,
			instructions: `${INSIGHTS_SYSTEM_PROMPT}${insightsToolWorkflow}`,
			tools,
			stopWhen: stepCountIs(INSIGHTS_AGENT_MAX_STEPS),
			temperature: 0.2,
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.analyze_website",
				metadata: {
					source: "insights",
					feature: "smart_insights",
					mode: "agent",
					organizationId,
					userId,
					websiteId,
					websiteDomain: domain,
					timezone,
				},
			},
		});

		await agent.generate({
			messages: [{ role: "user", content: userPrompt }],
			abortSignal: AbortSignal.timeout(INSIGHTS_AGENT_TIMEOUT_MS),
		});

		const submitted = getSubmittedInsights();
		if (submitted && submitted.length > 0) {
			return submitted;
		}

		useLogger().warn("Insights agent finished without submit_insights", {
			insights: { websiteId },
		});
	} catch (error) {
		useLogger().warn("Insights agent failed, using legacy fallback", {
			insights: { websiteId, error },
		});
	}

	return analyzeWebsiteLegacy(
		organizationId,
		userId,
		websiteId,
		domain,
		timezone,
		period,
		orgSites,
		annotationContext,
		recentInsightsBlock
	);
}

async function processInBatches<T, R>(
	items: T[],
	action: (item: T) => Promise<R>,
	limit: number
): Promise<R[]> {
	const results: R[] = [];
	let nextIndex = 0;

	async function worker() {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) {
				break;
			}
			const item = items[index];
			if (item === undefined) {
				break;
			}
			results.push(await action(item));
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker())
	);
	return results;
}

async function getRecentInsightsFromDb(
	organizationId: string
): Promise<WebsiteInsight[] | null> {
	const cutoff = dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate();

	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			websiteName: websites.name,
			websiteDomain: websites.domain,
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			suggestion: analyticsInsights.suggestion,
			severity: analyticsInsights.severity,
			sentiment: analyticsInsights.sentiment,
			type: analyticsInsights.type,
			priority: analyticsInsights.priority,
			changePercent: analyticsInsights.changePercent,
			metrics: analyticsInsights.metrics,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff),
				isNull(websites.deletedAt)
			)
		)
		.orderBy(desc(analyticsInsights.priority))
		.limit(10);

	if (rows.length === 0) {
		return null;
	}

	return rows.map(
		(r): WebsiteInsight => ({
			id: r.id,
			websiteId: r.websiteId,
			websiteName: r.websiteName,
			websiteDomain: r.websiteDomain,
			link: `/websites/${r.websiteId}`,
			title: r.title,
			description: r.description,
			suggestion: r.suggestion,
			metrics: (r.metrics as InsightMetricRow[] | null) ?? [],
			severity: r.severity as ParsedInsight["severity"],
			sentiment: r.sentiment as ParsedInsight["sentiment"],
			type: r.type as ParsedInsight["type"],
			priority: r.priority,
			changePercent: r.changePercent ?? undefined,
		})
	);
}

function getRedis() {
	try {
		return getRedisCache();
	} catch {
		return null;
	}
}

async function invalidateInsightsCacheForOrg(
	organizationId: string
): Promise<void> {
	const redis = getRedis();
	if (!redis) {
		return;
	}
	const pattern = `${CACHE_KEY_PREFIX}:${organizationId}:*`;
	let cursor = "0";
	try {
		do {
			const [nextCursor, keys] = (await redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100
			)) as [string, string[]];
			cursor = nextCursor;
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} while (cursor !== "0");
	} catch (error) {
		useLogger().info("Insights cache invalidation scan failed (best-effort)", {
			insights: { organizationId, error },
		});
	}
}

const NARRATIVE_RATE_LIMIT = 30;
const NARRATIVE_RATE_WINDOW_SECS = 3600;
const NARRATIVE_CACHE_TTL_SECS = 3600;
const NARRATIVE_INSIGHTS_LIMIT = 5;

function rangeWord(range: "7d" | "30d" | "90d"): string {
	if (range === "7d") {
		return "week";
	}
	if (range === "30d") {
		return "month";
	}
	return "quarter";
}

function buildDeterministicNarrative(
	range: "7d" | "30d" | "90d",
	topInsights: {
		title: string;
		severity: string;
		websiteName: string | null;
	}[]
): string {
	const word = rangeWord(range);
	if (topInsights.length === 0) {
		return `All systems healthy this ${word}. No actionable signals detected.`;
	}
	const headline = topInsights[0];
	const siteSuffix = headline.websiteName ? ` on ${headline.websiteName}` : "";
	if (topInsights.length === 1) {
		return `This ${word}: ${headline.title}${siteSuffix}.`;
	}
	const extra = topInsights.length - 1;
	return `This ${word}: ${headline.title}${siteSuffix}, plus ${extra} more signal${extra === 1 ? "" : "s"} worth reviewing.`;
}

const generateNarrativeCached = cacheable(
	async function generateNarrativeCached(
		organizationId: string,
		range: "7d" | "30d" | "90d"
	): Promise<{ narrative: string }> {
		const topInsights = await db
			.select({
				title: analyticsInsights.title,
				description: analyticsInsights.description,
				severity: analyticsInsights.severity,
				changePercent: analyticsInsights.changePercent,
				websiteName: websites.name,
			})
			.from(analyticsInsights)
			.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
			.where(eq(analyticsInsights.organizationId, organizationId))
			.orderBy(desc(analyticsInsights.priority))
			.limit(NARRATIVE_INSIGHTS_LIMIT);

		if (topInsights.length === 0) {
			return {
				narrative: `All systems healthy this ${rangeWord(range)}. No actionable signals detected.`,
			};
		}

		const insightLines = topInsights.map((ins) => {
			const site = ins.websiteName ? ` [${ins.websiteName}]` : "";
			const change =
				ins.changePercent == null
					? ""
					: ` (${ins.changePercent > 0 ? "+" : ""}${ins.changePercent.toFixed(0)}%)`;
			return `- [${ins.severity}] ${ins.title}${change}${site}: ${ins.description ?? ""}`;
		});

		const prompt = `You are an analytics assistant summarizing an organization's state over the last ${range}.

Write a crisp 2–3 sentence executive summary of the top insights below.

Rules:
- Lead with the most important change
- Include concrete numbers when available
- Never exceed 60 words total
- State facts, do not editorialize
- If nothing meaningful is happening, say so plainly

Top signals this ${range}:
${insightLines.join("\n")}`;

		let narrative = "";
		try {
			const result = await generateText({
				model: models.analytics,
				prompt,
				temperature: 0.2,
				maxOutputTokens: 200,
			});
			narrative = result.text.trim();
		} catch (error) {
			useLogger().warn("Narrative LLM call failed", {
				insights: { organizationId, range, error },
			});
		}

		if (!narrative) {
			narrative = buildDeterministicNarrative(range, topInsights);
			mergeWideEvent({ insights_narrative_fallback: true });
		}

		return { narrative };
	},
	{
		expireInSec: NARRATIVE_CACHE_TTL_SECS,
		prefix: "insights-narrative",
	}
);

export const insights = new Elysia({ prefix: "/v1/insights" })
	.derive(async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		return { user: session?.user ?? null };
	})
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			mergeWideEvent({ insights_ai_auth: "unauthorized" });
			set.status = 401;
			return {
				success: false,
				error: "Authentication required",
				code: "AUTH_REQUIRED",
			};
		}
	})
	.get(
		"/history",
		async ({ query, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required", insights: [] };
			}

			const { organizationId, websiteId: websiteIdFilter } = query;
			const limitParsed = Number.parseInt(query.limit ?? "50", 10);
			const limit = Number.isFinite(limitParsed)
				? Math.min(Math.max(limitParsed, 1), 100)
				: 50;
			const offsetParsed = Number.parseInt(query.offset ?? "0", 10);
			const offset = Number.isFinite(offsetParsed)
				? Math.max(offsetParsed, 0)
				: 0;

			mergeWideEvent({ insights_history_org_id: organizationId });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				mergeWideEvent({ insights_history_access: "denied" });
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					insights: [],
				};
			}

			const whereClause = websiteIdFilter
				? and(
						eq(analyticsInsights.organizationId, organizationId),
						eq(analyticsInsights.websiteId, websiteIdFilter),
						isNull(websites.deletedAt)
					)
				: and(
						eq(analyticsInsights.organizationId, organizationId),
						isNull(websites.deletedAt)
					);

			const rows = await db
				.select({
					id: analyticsInsights.id,
					runId: analyticsInsights.runId,
					websiteId: analyticsInsights.websiteId,
					websiteName: websites.name,
					websiteDomain: websites.domain,
					title: analyticsInsights.title,
					description: analyticsInsights.description,
					suggestion: analyticsInsights.suggestion,
					severity: analyticsInsights.severity,
					sentiment: analyticsInsights.sentiment,
					type: analyticsInsights.type,
					priority: analyticsInsights.priority,
					changePercent: analyticsInsights.changePercent,
					metrics: analyticsInsights.metrics,
					createdAt: analyticsInsights.createdAt,
					currentPeriodFrom: analyticsInsights.currentPeriodFrom,
					currentPeriodTo: analyticsInsights.currentPeriodTo,
					previousPeriodFrom: analyticsInsights.previousPeriodFrom,
					previousPeriodTo: analyticsInsights.previousPeriodTo,
					timezone: analyticsInsights.timezone,
				})
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(whereClause)
				.orderBy(desc(analyticsInsights.createdAt))
				.limit(limit)
				.offset(offset);

			const insights = rows.map((r) => ({
				id: r.id,
				runId: r.runId,
				websiteId: r.websiteId,
				websiteName: r.websiteName,
				websiteDomain: r.websiteDomain,
				link: `/websites/${r.websiteId}`,
				title: r.title,
				description: r.description,
				suggestion: r.suggestion,
				metrics: (r.metrics as InsightMetricRow[] | null) ?? [],
				severity: r.severity,
				sentiment: r.sentiment,
				type: r.type,
				priority: r.priority,
				changePercent: r.changePercent ?? undefined,
				createdAt: r.createdAt.toISOString(),
				currentPeriodFrom: r.currentPeriodFrom,
				currentPeriodTo: r.currentPeriodTo,
				previousPeriodFrom: r.previousPeriodFrom,
				previousPeriodTo: r.previousPeriodTo,
				timezone: r.timezone,
			}));

			return {
				success: true,
				insights,
				hasMore: rows.length === limit,
			};
		},
		{
			query: t.Object({
				organizationId: t.String(),
				limit: t.Optional(t.String()),
				offset: t.Optional(t.String()),
				websiteId: t.Optional(t.String()),
			}),
		}
	)
	.get(
		"/org-narrative",
		async ({ query, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required" };
			}

			const { organizationId, range } = query;
			mergeWideEvent({
				insights_narrative_org_id: organizationId,
				insights_narrative_range: range,
			});

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				mergeWideEvent({ insights_narrative_access: "denied" });
				set.status = 403;
				return { success: false, error: "Access denied to this organization" };
			}

			const rl = await rateLimit(
				`insights:narrative:${organizationId}:${userId}`,
				NARRATIVE_RATE_LIMIT,
				NARRATIVE_RATE_WINDOW_SECS
			);
			const rlHeaders = getRateLimitHeaders(rl);
			for (const [key, value] of Object.entries(rlHeaders)) {
				set.headers[key] = value;
			}
			if (!rl.success) {
				set.status = 429;
				return {
					success: false,
					error: "Rate limit exceeded. Try again later.",
				};
			}

			try {
				const { narrative } = await generateNarrativeCached(
					organizationId,
					range
				);
				return {
					success: true,
					narrative,
					generatedAt: new Date().toISOString(),
				};
			} catch (error) {
				captureError(error, {
					insights_narrative_org_id: organizationId,
					insights_narrative_range: range,
				});
				useLogger().warn("Failed to generate org narrative", {
					insights: { organizationId, range, error },
				});
				set.status = 500;
				return { success: false, error: "Could not generate narrative" };
			}
		},
		{
			query: t.Object({
				organizationId: t.String(),
				range: t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("90d")]),
			}),
		}
	)
	.post(
		"/clear",
		async ({ body, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required", deleted: 0 };
			}

			const { organizationId } = body;
			mergeWideEvent({ insights_clear_org_id: organizationId });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					deleted: 0,
				};
			}

			const idRows = await db
				.select({ id: analyticsInsights.id })
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, organizationId));

			const ids = idRows.map((r) => r.id);

			if (ids.length > 0) {
				await db
					.delete(insightUserFeedback)
					.where(
						and(
							eq(insightUserFeedback.organizationId, organizationId),
							inArray(insightUserFeedback.insightId, ids)
						)
					);
				await db
					.delete(analyticsInsights)
					.where(eq(analyticsInsights.organizationId, organizationId));
			}

			await invalidateInsightsCacheForOrg(organizationId);
			mergeWideEvent({ insights_cleared: ids.length });

			return { success: true, deleted: ids.length };
		},
		{
			body: t.Object({
				organizationId: t.String(),
			}),
		}
	)
	.post(
		"/ai",
		async ({ body, user, set }) => {
			const userId = user?.id;
			if (!userId) {
				mergeWideEvent({ insights_ai_error: "missing_user_id" });
				return { success: false, error: "User ID required", insights: [] };
			}

			const { organizationId, timezone = "UTC" } = body;
			mergeWideEvent({
				insights_org_id: organizationId,
				insights_timezone: timezone,
			});

			const redis = getRedis();
			const cacheKey = `${CACHE_KEY_PREFIX}:${organizationId}:${timezone}`;

			if (redis) {
				try {
					const cached = await redis.get(cacheKey);
					if (cached) {
						mergeWideEvent({ insights_cache: "hit" });
						const payload = JSON.parse(cached) as InsightsPayload;
						return { success: true, ...payload };
					}
				} catch (error) {
					useLogger().info(
						"Insights cache read failed; continuing without cache",
						{
							insights: { error },
						}
					);
				}
			}

			mergeWideEvent({ insights_cache: "miss" });

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
				mergeWideEvent({ insights_access: "denied" });
				set.status = 403;
				return {
					success: false,
					error: "Access denied to this organization",
					insights: [],
				};
			}

			const recentInsights = await getRecentInsightsFromDb(organizationId);
			if (recentInsights) {
				mergeWideEvent({
					insights_returned: recentInsights.length,
					insights_source: "db_cooldown",
				});
				const payload: InsightsPayload = {
					insights: recentInsights,
					source: "ai",
				};
				if (redis) {
					redis
						.setex(cacheKey, CACHE_TTL, JSON.stringify(payload))
						.catch(() => {});
				}
				return { success: true, ...payload };
			}

			const orgSites = await db.query.websites.findMany({
				where: and(
					eq(websites.organizationId, organizationId),
					isNull(websites.deletedAt)
				),
				columns: { id: true, name: true, domain: true },
			});

			if (orgSites.length === 0) {
				mergeWideEvent({ insights_websites: 0 });
				return { success: true, insights: [], source: "ai" };
			}

			try {
				const period = getWeekOverWeekPeriod();
				const dedupeKeyToId =
					await fetchInsightDedupeKeyToIdMap(organizationId);
				const groups = await processInBatches(
					orgSites.slice(0, MAX_WEBSITES),
					async (site: { id: string; name: string | null; domain: string }) => {
						const results = await analyzeWebsite(
							organizationId,
							userId,
							site.id,
							site.domain,
							timezone,
							period,
							orgSites
						);
						return results.map(
							(insight): WebsiteInsight => ({
								...insight,
								id: crypto.randomUUID(),
								websiteId: site.id,
								websiteName: site.name,
								websiteDomain: site.domain,
								link: `/websites/${site.id}`,
							})
						);
					},
					CONCURRENCY
				);

				const merged = groups.flat().sort((a, b) => b.priority - a.priority);
				const seenInBatch = new Set<string>();
				const sorted: WebsiteInsight[] = [];
				for (const insight of merged) {
					const key = insightDedupeKey(
						insight.websiteId,
						insight.type,
						insight.sentiment,
						insight.changePercent ?? null
					);
					if (seenInBatch.has(key)) {
						continue;
					}
					seenInBatch.add(key);
					const existingId = dedupeKeyToId.get(key);
					if (existingId) {
						sorted.push({ ...insight, id: existingId });
					} else {
						sorted.push(insight);
					}
					if (sorted.length >= 10) {
						break;
					}
				}

				const runId = crypto.randomUUID();
				let finalInsights: WebsiteInsight[] = sorted;
				if (sorted.length > 0) {
					const toInsert: {
						id: string;
						organizationId: string;
						websiteId: string;
						runId: string;
						title: string;
						description: string;
						suggestion: string;
						severity: string;
						sentiment: string;
						type: string;
						priority: number;
						changePercent: number | null;
						metrics: InsightMetricRow[] | null;
						timezone: string;
						currentPeriodFrom: string;
						currentPeriodTo: string;
						previousPeriodFrom: string;
						previousPeriodTo: string;
					}[] = [];

					for (const insight of sorted) {
						const key = insightDedupeKey(
							insight.websiteId,
							insight.type,
							insight.sentiment,
							insight.changePercent ?? null
						);
						const existingId = dedupeKeyToId.get(key);
						if (existingId && insight.id === existingId) {
							continue;
						}
						toInsert.push({
							id: insight.id,
							organizationId,
							websiteId: insight.websiteId,
							runId,
							title: insight.title,
							description: insight.description,
							suggestion: insight.suggestion,
							severity: insight.severity,
							sentiment: insight.sentiment,
							type: insight.type,
							priority: insight.priority,
							changePercent: insight.changePercent ?? null,
							metrics: insight.metrics.length > 0 ? insight.metrics : null,
							timezone,
							currentPeriodFrom: period.current.from,
							currentPeriodTo: period.current.to,
							previousPeriodFrom: period.previous.from,
							previousPeriodTo: period.previous.to,
						});
					}

					const updatePayload = {
						runId,
						timezone,
						currentPeriodFrom: period.current.from,
						currentPeriodTo: period.current.to,
						previousPeriodFrom: period.previous.from,
						previousPeriodTo: period.previous.to,
						createdAt: new Date(),
					};

					try {
						if (toInsert.length > 0) {
							await db.insert(analyticsInsights).values(toInsert);
						}
						const toRefresh = sorted.filter((insight) => {
							const key = insightDedupeKey(
								insight.websiteId,
								insight.type,
								insight.sentiment,
								insight.changePercent ?? null
							);
							const existingId = dedupeKeyToId.get(key);
							return existingId !== undefined && insight.id === existingId;
						});
						await Promise.all(
							toRefresh.map((insight) =>
								db
									.update(analyticsInsights)
									.set({
										...updatePayload,
										title: insight.title,
										description: insight.description,
										suggestion: insight.suggestion,
										severity: insight.severity,
										sentiment: insight.sentiment,
										type: insight.type,
										priority: insight.priority,
										changePercent: insight.changePercent ?? null,
										metrics:
											insight.metrics.length > 0 ? insight.metrics : null,
									})
									.where(eq(analyticsInsights.id, insight.id))
							)
						);
					} catch (error) {
						useLogger().warn("Failed to persist analytics insights", {
							insights: { organizationId, error },
						});
						finalInsights = [];
						mergeWideEvent({ insights_persist_failed: true });
					}
				}

				for (const site of orgSites.slice(0, MAX_WEBSITES)) {
					const siteInsights = finalInsights.filter(
						(s) => s.websiteId === site.id
					);
					if (siteInsights.length > 0) {
						const summary = siteInsights
							.map(
								(s) =>
									`[${s.severity}] ${s.title}: ${s.description} Suggestion: ${s.suggestion}`
							)
							.join("\n");
						storeAnalyticsSummary(
							`Weekly insights for ${site.domain} (${dayjs().format("YYYY-MM-DD")}):\n${summary}`,
							site.id,
							{ period: "weekly" }
						).catch((error: unknown) => {
							useLogger().warn("Failed to store analytics summary", {
								insights: { websiteId: site.id, error },
							});
						});
					}
				}

				const payload: InsightsPayload = {
					insights: finalInsights,
					source: "ai",
				};

				if (redis && finalInsights.length > 0) {
					redis
						.setex(cacheKey, CACHE_TTL, JSON.stringify(payload))
						.catch(() => {});
				}

				if (redis && finalInsights.length === 0) {
					redis
						.setex(cacheKey, CACHE_TTL / 3, JSON.stringify(payload))
						.catch(() => {});
				}

				mergeWideEvent({
					insights_returned: finalInsights.length,
					insights_source: "ai",
				});
				return { success: true, ...payload };
			} catch (error) {
				mergeWideEvent({ insights_error: true });
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ insights: { organizationId } }
				);
				return { success: false, insights: [], source: "fallback" };
			}
		},
		{
			body: t.Object({
				organizationId: t.String(),
				timezone: t.Optional(t.String()),
			}),
			idleTimeout: 240_000,
		}
	);
