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
import { logger } from "@databuddy/shared/logger";
import { Output, stepCountIs, ToolLoopAgent } from "ai";
import dayjs from "dayjs";
import { Elysia, t } from "elysia";
import { z } from "zod";
import type { AppContext } from "../ai/config/context";
import { gateway } from "../ai/config/models";
import { buildAnalyticsInstructions } from "../ai/prompts/analytics";
import { executeQueryBuilderTool } from "../ai/tools/execute-query-builder";
import { getDataTool } from "../ai/tools/get-data";
import { getTopPagesTool } from "../ai/tools/get-top-pages";

const CACHE_TTL = 900;
const CACHE_KEY_PREFIX = "ai-insights";
const TIMEOUT_MS = 90_000;
const MAX_WEBSITES = 5;
const CONCURRENCY = 3;

const insightSchema = z.object({
	title: z.string().describe("Brief headline under 60 chars"),
	description: z
		.string()
		.describe("2-3 sentences with specific numbers from the data"),
	suggestion: z
		.string()
		.describe(
			'One concrete action, e.g. "Investigate the /checkout page for errors"'
		),
	severity: z.enum(["critical", "warning", "info"]),
	sentiment: z
		.enum(["positive", "neutral", "negative"])
		.describe(
			"positive = good trend, neutral = informational, negative = needs attention"
		),
	priority: z.number().min(1).max(10).describe("1-10 where 10 is most urgent"),
	type: z.enum([
		"error_spike",
		"traffic_drop",
		"traffic_spike",
		"vitals_degraded",
		"performance",
		"custom_event_spike",
	]),
	changePercent: z
		.number()
		.optional()
		.describe("Percentage change if applicable"),
});

const insightsOutputSchema = z.object({
	insights: z
		.array(insightSchema)
		.max(3)
		.describe("1-3 actionable insights based on real data from tool calls"),
});

type ParsedInsight = z.infer<typeof insightSchema>;

const INSIGHTS_PROMPT = `Analyze this website. Use get_data to fetch summary_metrics and top_pages for the last 7 days AND the previous 7 days in a single batched call. Compare the two periods.

Look for:
1. Traffic changes (pageviews, visitors) - any shift over 10%
2. Error rate changes
3. Notable page-level changes in the top pages

Rules:
- Always provide at least 1 insight, even if it is a positive or neutral observation (e.g. "Traffic is stable" or "Steady growth in visitors")
- Include real numbers from the data in every description
- If user annotations explain a change, still mention it but note it is expected
- Focus on the most significant or unexpected changes first
- Maximum 3 insights`;

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

	return `\n\nUser annotations (known events that may explain traffic changes):\n${lines.join("\n")}`;
}

function createInsightsTools() {
	return {
		get_top_pages: getTopPagesTool,
		get_data: getDataTool,
		execute_query_builder: executeQueryBuilderTool,
	};
}

async function analyzeWebsite(
	websiteId: string,
	domain: string,
	timezone: string,
	userId: string,
	headers: Headers
): Promise<ParsedInsight[]> {
	const appContext: AppContext = {
		userId,
		websiteId,
		websiteDomain: domain,
		timezone,
		currentDateTime: new Date().toISOString(),
		chatId: `insights-${websiteId}`,
		requestHeaders: headers,
	};

	const agent = new ToolLoopAgent({
		model: gateway.chat("anthropic/claude-sonnet-4-5"),
		instructions: buildAnalyticsInstructions(appContext),
		tools: createInsightsTools(),
		output: Output.object({ schema: insightsOutputSchema }),
		stopWhen: stepCountIs(10),
		temperature: 0.2,
		experimental_context: appContext,
	});

	try {
		const annotationContext = await fetchRecentAnnotations(websiteId);
		const prompt = INSIGHTS_PROMPT + annotationContext;

		const result = await agent.generate({
			messages: [{ role: "user" as const, content: prompt }],
			timeout: TIMEOUT_MS,
		});

		if (!result.output) {
			logger.warn(
				{ websiteId, text: result.text?.slice(0, 300) },
				"Agent returned no structured output"
			);
			return [];
		}

		return result.output.insights;
	} catch (error) {
		logger.warn({ websiteId, error }, "Failed to generate insights");
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
		async ({ body, user, request }) => {
			const userId = user?.id;
			if (!userId) {
				return { success: false, error: "User ID required", insights: [] };
			}

			const { organizationId, timezone = "UTC" } = body;
			const redis = getRedis();
			const cacheKey = `${CACHE_KEY_PREFIX}:${organizationId}`;

			if (redis) {
				try {
					const cached = await redis.get(cacheKey);
					if (cached) {
						const payload = JSON.parse(cached) as InsightsPayload;
						return { success: true, ...payload };
					}
				} catch {
					// proceed without cache
				}
			}

			const memberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			const orgIds = new Set(memberships.map((m) => m.organizationId));
			if (!orgIds.has(organizationId)) {
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
				return { success: true, insights: [], source: "ai" };
			}

			try {
				const groups = await processInBatches(
					sites.slice(0, MAX_WEBSITES),
					async (site) => {
						const results = await analyzeWebsite(
							site.id,
							site.domain,
							timezone,
							userId,
							request.headers
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

				return { success: true, ...payload };
			} catch (error) {
				logger.error(
					{ error, organizationId },
					"AI insights generation failed"
				);
				return { success: true, insights: [], source: "fallback" };
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
