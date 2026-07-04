import { and, db, desc, eq, profileTraitChanges } from "@databuddy/db";
import { getTraitDistribution } from "@databuddy/services/identity";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";
import { getAppContext, resolveToolWebsite } from "./utils";
import { createToolLogger } from "./utils/logger";

const websiteIdInput = z
	.string()
	.optional()
	.describe(
		"Target website id. Omit to use the workspace default. Get ids from list_websites."
	);

const profileFilters = z
	.array(
		z.object({
			field: z.string(),
			op: z.enum([
				"eq",
				"ne",
				"contains",
				"not_contains",
				"starts_with",
				"in",
				"not_in",
			]),
			value: z.union([z.string(), z.number()]),
		})
	)
	.optional();

function daysAgo(d: number): string {
	const date = new Date();
	date.setDate(date.getDate() - d);
	return date.toISOString().split("T").at(0) ?? "";
}

function today(): string {
	return new Date().toISOString().split("T").at(0) ?? "";
}

export interface ResolvedProfileSite {
	domain: string | null;
	websiteId: string;
}

export interface ProfileToolsOptions {
	descriptionSuffix?: string;
	loggerName: string;
	resolveSite: (
		websiteId: string | undefined,
		options: { experimental_context?: unknown }
	) => Promise<ResolvedProfileSite>;
	websiteIdSchema: z.ZodString | z.ZodOptional<z.ZodString>;
}

export function buildProfileTools(opts: ProfileToolsOptions): ToolSet {
	const logger = createToolLogger(opts.loggerName);
	const suffix = opts.descriptionSuffix ?? "";

	return {
		list_profiles: tool({
			description: `List recent visitor profiles (sessions, pageviews, device, geo, browser, referrer). Use for visitors/users/audience questions.${suffix}`,
			inputSchema: z.object({
				websiteId: opts.websiteIdSchema,
				days: z.number().min(1).max(90).default(7),
				limit: z.number().min(1).max(50).default(10),
				filters: profileFilters,
			}),
			execute: async ({ websiteId, days, limit, filters }, options) => {
				const site = await opts.resolveSite(websiteId, options);
				const req: QueryRequest = {
					projectId: site.websiteId,
					type: "profile_list",
					from: daysAgo(days),
					to: today(),
					limit,
					filters,
					timezone: "UTC",
				};
				const data = await executeQuery(req, site.domain, "UTC");
				logger.info("Listed profiles", {
					websiteId: site.websiteId,
					days,
					resultCount: data.length,
				});
				return {
					profiles: data,
					count: data.length,
					period: `Last ${days} days`,
				};
			},
		}),

		get_profile: tool({
			description: `Visitor detail by anonymous_id: first/last activity, sessions across analytics/custom/error/vital/link events, pageviews, duration, device, browser, OS, location.${suffix}`,
			inputSchema: z.object({
				websiteId: opts.websiteIdSchema,
				visitorId: z.string(),
				days: z.number().min(1).max(365).default(30),
			}),
			execute: async ({ websiteId, visitorId, days }, options) => {
				const site = await opts.resolveSite(websiteId, options);
				const req: QueryRequest = {
					projectId: site.websiteId,
					type: "profile_detail",
					from: daysAgo(days),
					to: today(),
					filters: [{ field: "anonymous_id", op: "eq", value: visitorId }],
					timezone: "UTC",
				};
				const data = await executeQuery(req, site.domain, "UTC");
				if (data.length === 0) {
					return {
						profile: null,
						message: `No data found for visitor ${visitorId} in the last ${days} days.`,
					};
				}
				logger.info("Fetched profile detail", {
					websiteId: site.websiteId,
					visitorId,
				});
				return { profile: data.at(0), period: `Last ${days} days` };
			},
		}),

		get_profile_history: tool({
			description: `Trait change timeline for an identified profile (profile_id). Each entry shows which traits changed (old and new values) plus the full trait snapshot after the change — answers "when did the plan change" and "what were the traits at time T" directly.${suffix}`,
			inputSchema: z.object({
				websiteId: opts.websiteIdSchema,
				profileId: z.string(),
				limit: z.number().min(1).max(200).default(50),
			}),
			execute: async ({ websiteId, profileId, limit }, options) => {
				const site = await opts.resolveSite(websiteId, options);
				const history = await db
					.select({
						changes: profileTraitChanges.changes,
						traits: profileTraitChanges.traits,
						source: profileTraitChanges.source,
						changedAt: profileTraitChanges.createdAt,
					})
					.from(profileTraitChanges)
					.where(
						and(
							eq(profileTraitChanges.websiteId, site.websiteId),
							eq(profileTraitChanges.profileId, profileId)
						)
					)
					.orderBy(desc(profileTraitChanges.createdAt))
					.limit(limit);
				logger.info("Fetched profile trait history", {
					websiteId: site.websiteId,
					profileId,
					changeCount: history.length,
				});
				return { history, count: history.length };
			},
		}),

		list_profile_traits: tool({
			description: `Distribution of identified-user traits: every trait key, its values, and how many profiles carry each value, plus the total identified profile count. Call this before segmenting to learn which keys and values exist and to quantify identified-vs-anonymous coverage. To measure sessions or behavior per segment, follow up with get_data using a trait:<key> filter (e.g. session_metrics filtered by trait:plan eq pro) — that is how profiles link to sessions; prefer aggregate query types like session_metrics/summary_metrics for totals instead of summing time series rows by hand.${suffix}`,
			inputSchema: z.object({
				websiteId: opts.websiteIdSchema,
			}),
			execute: async ({ websiteId }, options) => {
				const site = await opts.resolveSite(websiteId, options);
				const distribution = await getTraitDistribution(site.websiteId);
				logger.info("Fetched trait distribution", {
					websiteId: site.websiteId,
					identifiedProfiles: distribution.identifiedProfiles,
					traitRows: distribution.traits.length,
				});
				return distribution;
			},
		}),

		get_profile_sessions: tool({
			description: `Session history for a visitor, including analytics events, custom events, errors, outgoing links, and separate web vitals context. Use after list_profiles/get_profile.${suffix}`,
			inputSchema: z.object({
				websiteId: opts.websiteIdSchema,
				visitorId: z.string(),
				days: z.number().min(1).max(365).default(30),
				limit: z.number().min(1).max(100).default(20),
			}),
			execute: async ({ websiteId, visitorId, days, limit }, options) => {
				const site = await opts.resolveSite(websiteId, options);
				const req: QueryRequest = {
					projectId: site.websiteId,
					type: "profile_sessions",
					from: daysAgo(days),
					to: today(),
					limit,
					filters: [{ field: "anonymous_id", op: "eq", value: visitorId }],
					timezone: "UTC",
				};
				const data = await executeQuery(req, site.domain, "UTC");
				logger.info("Fetched profile sessions", {
					websiteId: site.websiteId,
					visitorId,
					sessionCount: data.length,
				});
				return {
					sessions: data,
					count: data.length,
					period: `Last ${days} days`,
				};
			},
		}),
	};
}

export function createProfileTools(): ToolSet {
	return buildProfileTools({
		loggerName: "Profiles",
		websiteIdSchema: websiteIdInput,
		descriptionSuffix:
			" Pass websiteId to target a specific site; omit to use the workspace default.",
		resolveSite: async (websiteId, options) => {
			const ctx = getAppContext(options);
			const resolved = resolveToolWebsite(ctx, websiteId);
			const domain =
				resolved.domain || (await getWebsiteDomain(resolved.websiteId));
			return { websiteId: resolved.websiteId, domain };
		},
	});
}
