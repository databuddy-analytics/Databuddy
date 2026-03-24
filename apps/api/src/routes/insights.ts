import { auth } from "@databuddy/auth";
import {
	and,
	annotations,
	db,
	eq,
	gte,
	isNull,
	member,
	websites,
} from "@databuddy/db";
import { getRedisCache } from "@databuddy/redis";
import { generateText, Output } from "ai";
import dayjs from "dayjs";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { z } from "zod";
import { gateway } from "../ai/config/models";
import { storeAnalyticsSummary } from "../lib/supermemory";
import { mergeWideEvent } from "../lib/tracing";
import { executeQuery } from "../query";

const CACHE_TTL = 900;
const CACHE_KEY_PREFIX = "ai-insights";
const TIMEOUT_MS = 60_000;
const MAX_WEBSITES = 5;
const CONCURRENCY = 3;

const insightSchema = z.object({
	title: z
		.string()
		.describe(
			"Brief headline under 60 chars with the key number, e.g. 'Visitors up 23% week-over-week'"
		),
	description: z
		.string()
		.describe(
			"2-3 sentences with specific numbers from BOTH periods. Always include the actual values and the delta."
		),
	suggestion: z
		.string()
		.describe(
			'One concrete, specific action. Good: "Your /blog/seo-guide drove 40% of traffic - share it on social." Bad: "Monitor your traffic."'
		),
	severity: z.enum(["critical", "warning", "info"]),
	sentiment: z
		.enum(["positive", "neutral", "negative"])
		.describe(
			"positive = improving metric, neutral = stable, negative = declining or broken"
		),
	priority: z
		.number()
		.min(1)
		.max(10)
		.describe(
			"1-10. Errors affecting users = 8-10, significant traffic change = 5-7, stable/informational = 1-4"
		),
	type: z.enum([
		"error_spike",
		"new_errors",
		"traffic_drop",
		"traffic_spike",
		"bounce_rate_change",
		"engagement_change",
		"referrer_change",
		"page_trend",
		"positive_trend",
		"performance",
	]),
	changePercent: z
		.number()
		.optional()
		.describe("Percentage change between periods, e.g. -15.5 for a 15.5% drop"),
});

const insightsOutputSchema = z.object({
	insights: z
		.array(insightSchema)
		.max(3)
		.describe(
			"1-3 insights ranked by surprise-factor x impact. Focus on what changed and why it matters."
		),
});

type ParsedInsight = z.infer<typeof insightSchema>;

interface WebsiteInsight extends ParsedInsight {
	id: string;
	websiteId: string;
	websiteName: string | null;
	websiteDomain: string;
	link: string;
}

interface InsightsPayload {
	insights: WebsiteInsight[];
	source: "ai" | "fallback";
}

interface PeriodData {
	summary: Record<string, unknown>[];
	topPages: Record<string, unknown>[];
	errorSummary: Record<string, unknown>[];
	topReferrers: Record<string, unknown>[];
}

async function fetchPeriodData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<PeriodData> {
	const base = { projectId: websiteId, from, to, timezone };

	const [summary, topPages, errorSummary, topReferrers] =
		await Promise.allSettled([
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone),
			executeQuery({ ...base, type: "top_pages", limit: 10 }, domain, timezone),
			executeQuery({ ...base, type: "error_summary" }, domain, timezone),
			executeQuery(
				{ ...base, type: "top_referrers", limit: 10 },
				domain,
				timezone
			),
		]);

	return {
		summary: summary.status === "fulfilled" ? summary.value : [],
		topPages: topPages.status === "fulfilled" ? topPages.value : [],
		errorSummary: errorSummary.status === "fulfilled" ? errorSummary.value : [],
		topReferrers: topReferrers.status === "fulfilled" ? topReferrers.value : [],
	};
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
	sections.push(`### Summary\n${JSON.stringify(current.summary)}`);
	if (current.topPages.length > 0) {
		sections.push(`### Top Pages\n${JSON.stringify(current.topPages)}`);
	}
	if (current.errorSummary.length > 0) {
		sections.push(`### Errors\n${JSON.stringify(current.errorSummary)}`);
	}
	if (current.topReferrers.length > 0) {
		sections.push(`### Top Referrers\n${JSON.stringify(current.topReferrers)}`);
	}

	sections.push(
		`\n## Previous Period (${previousRange.from} to ${previousRange.to})`
	);
	sections.push(`### Summary\n${JSON.stringify(previous.summary)}`);
	if (previous.topPages.length > 0) {
		sections.push(`### Top Pages\n${JSON.stringify(previous.topPages)}`);
	}
	if (previous.errorSummary.length > 0) {
		sections.push(`### Errors\n${JSON.stringify(previous.errorSummary)}`);
	}

	return sections.join("\n\n");
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

const INSIGHTS_SYSTEM_PROMPT = `You are an analytics insights engine. Your job is to find the 1-3 most significant, actionable findings from week-over-week website data.

Significance thresholds:
- Traffic (pageviews/visitors/sessions): <5% change = only mention if nothing else notable. 5-15% = worth noting. >15% = significant. >30% = critical.
- Errors: new error types = always report. Error rate up >0.5% = warning. Error rate up >2% = critical.
- Bounce rate: change >5 percentage points = notable.
- Pages: new page entering top 10 or page dropping out = notable. Individual page change >25% = significant.
- Referrers: new source appearing or major source declining >20% = notable.

Rules:
- Every insight MUST include specific numbers from both periods (e.g. "1,234 visitors, up from 987 last week")
- Every suggestion MUST be a concrete next step, not generic advice
- If annotations explain a change, mention it but still report the data
- If everything is stable, return ONE positive/neutral insight (e.g. "Steady at 2,400 weekly visitors")
- Rank by surprise-factor x business-impact
- Never fabricate or round numbers beyond what's in the data`;

async function analyzeWebsite(
	organizationId: string,
	userId: string,
	websiteId: string,
	domain: string,
	timezone: string
): Promise<ParsedInsight[]> {
	const now = dayjs();
	const currentRange = {
		from: now.subtract(7, "day").format("YYYY-MM-DD"),
		to: now.format("YYYY-MM-DD"),
	};
	const previousRange = {
		from: now.subtract(14, "day").format("YYYY-MM-DD"),
		to: now.subtract(7, "day").format("YYYY-MM-DD"),
	};

	const [current, previous, annotationContext] = await Promise.all([
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
		fetchRecentAnnotations(websiteId),
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

	const prompt = `Analyze this website's week-over-week data and return insights.\n\n${dataSection}${annotationContext}`;

	try {
		const result = await generateText({
			model: gateway.chat("anthropic/claude-opus-4.6"),
			output: Output.object({ schema: insightsOutputSchema }),
			system: INSIGHTS_SYSTEM_PROMPT,
			prompt,
			temperature: 0.2,
			abortSignal: AbortSignal.timeout(TIMEOUT_MS),
			experimental_telemetry: {
				isEnabled: true,
				functionId: "databuddy.insights.analyze_website",
				metadata: {
					source: "insights",
					feature: "smart_insights",
					organizationId,
					userId,
					websiteId,
					websiteDomain: domain,
					timezone,
				},
			},
		});

		if (!result.output) {
			useLogger().warn("No structured output from insights model", {
				insights: { websiteId },
			});
			return [];
		}

		return result.output.insights;
	} catch (error) {
		useLogger().warn("Failed to generate insights", {
			insights: { websiteId, error },
		});
		return [];
	}
}

async function processInBatches<T, R>(
	items: T[],
	action: (item: T) => Promise<R>,
	limit: number
): Promise<R[]> {
	const results: R[] = [];
	const pending = [...items];

	async function run() {
		while (pending.length > 0) {
			const item = pending.shift();
			if (item !== undefined) {
				results.push(await action(item));
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => run())
	);
	return results;
}

function getRedis() {
	try {
		return getRedisCache();
	} catch {
		return null;
	}
}

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
	.post(
		"/ai",
		async ({ body, user }) => {
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
			const cacheKey = `${CACHE_KEY_PREFIX}:${organizationId}`;

			if (redis) {
				try {
					const cached = await redis.get(cacheKey);
					if (cached) {
						mergeWideEvent({ insights_cache: "hit" });
						const payload = JSON.parse(cached) as InsightsPayload;
						return { success: true, ...payload };
					}
				} catch {
					// proceed without cache
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
				return {
					success: false,
					error: "Access denied to this organization",
					insights: [],
				};
			}

			const sites = await db.query.websites.findMany({
				where: eq(websites.organizationId, organizationId),
				columns: { id: true, name: true, domain: true },
			});

			if (sites.length === 0) {
				mergeWideEvent({ insights_websites: 0 });
				return { success: true, insights: [], source: "ai" };
			}

			try {
				const groups = await processInBatches(
					sites.slice(0, MAX_WEBSITES),
					async (site) => {
						const results = await analyzeWebsite(
							organizationId,
							userId,
							site.id,
							site.domain,
							timezone
						);
						return results.map(
							(insight, i): WebsiteInsight => ({
								...insight,
								id: `${site.id}-${i}`,
								websiteId: site.id,
								websiteName: site.name,
								websiteDomain: site.domain,
								link: `/websites/${site.id}`,
							})
						);
					},
					CONCURRENCY
				);

				const sorted = groups
					.flat()
					.sort((a, b) => b.priority - a.priority)
					.slice(0, 10);

				for (const site of sites.slice(0, MAX_WEBSITES) as Array<{
					id: string;
					name: string;
					domain: string;
				}>) {
					const siteInsights = sorted.filter((s) => s.websiteId === site.id);
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
						);
					}
				}

				const payload: InsightsPayload = {
					insights: sorted,
					source: "ai",
				};

				if (redis && sorted.length > 0) {
					redis
						.setex(cacheKey, CACHE_TTL, JSON.stringify(payload))
						.catch(() => {});
				}

				if (redis && sorted.length === 0) {
					redis
						.setex(cacheKey, CACHE_TTL / 3, JSON.stringify(payload))
						.catch(() => {});
				}

				mergeWideEvent({
					insights_returned: sorted.length,
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
			idleTimeout: 120_000,
		}
	);
