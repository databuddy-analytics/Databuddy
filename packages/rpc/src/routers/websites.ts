import { websitesApi } from "@databuddy/auth";
import {
	and,
	chQuery,
	db,
	eq,
	inArray,
	isNull,
	member,
	or,
	websites,
} from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import {
	buildWebsiteFilter,
	DuplicateDomainError,
	ValidationError,
	type Website,
	WebsiteNotFoundError,
	WebsiteService,
} from "@databuddy/services/websites";
import { logger } from "@databuddy/shared/logger";
import type { ProcessedMiniChartData } from "@databuddy/shared/types/website";
import {
	createWebsiteSchema,
	togglePublicWebsiteSchema,
	transferWebsiteSchema,
	transferWebsiteToOrgSchema,
	updateWebsiteSchema,
} from "@databuddy/validation";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";
import { invalidateWebsiteCaches } from "../utils/cache-invalidation";
import { getCacheAuthContext } from "../utils/cache-keys";

const websiteService = new WebsiteService(db);
const websiteCache = createDrizzleCache({ redis, namespace: "websites" });
const CACHE_DURATION = 60; // seconds
const TREND_THRESHOLD = 5; // percentage

interface EventsCheckResult {
	hasEvents: boolean;
	error: string | null;
}

async function getTrackingEventsStatus(
	websiteId: string
): Promise<EventsCheckResult> {
	try {
		const trackingCheckResult = await Promise.race([
			chQuery<{ count: number }>(
				`SELECT COUNT(*) as count FROM analytics.events WHERE client_id = {websiteId:String} AND event_name = 'screen_view' LIMIT 1`,
				{ websiteId }
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("ClickHouse query timeout")), 10_000)
			),
		]);

		return {
			hasEvents: (trackingCheckResult[0]?.count ?? 0) > 0,
			error: null,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error checking events";
		logger.error({ websiteId }, `Error checking tracking events: ${message}`);
		return { hasEvents: false, error: message };
	}
}

const buildStatusMessage = (hasEvents: boolean, eventsError: string | null) => {
	if (hasEvents) {
		return "Tracking is active and receiving events.";
	}

	if (eventsError) {
		return `Unable to check events: ${eventsError}`;
	}

	return "Tracking not set up. Please install the script tag.";
};
interface ChartDataPoint {
	websiteId: string;
	date: string;
	value: number;
	hasAnyData: number;
}

const calculateAverage = (values: { value: number }[]) =>
	values.length > 0
		? values.reduce((sum, item) => sum + item.value, 0) / values.length
		: 0;

const calculateTrend = (dataPoints: { date: string; value: number }[]) => {
	if (!dataPoints?.length || dataPoints.length < 4) {
		return null;
	}

	const midPoint = Math.floor(dataPoints.length / 2);
	const firstHalf = dataPoints.slice(0, midPoint);
	const secondHalf = dataPoints.slice(midPoint);

	const previousAverage = calculateAverage(firstHalf);
	const currentAverage = calculateAverage(secondHalf);

	if (previousAverage === 0) {
		return currentAverage > 0
			? { type: "up" as const, value: 100 }
			: { type: "neutral" as const, value: 0 };
	}

	const percentageChange =
		((currentAverage - previousAverage) / previousAverage) * 100;

	if (percentageChange > TREND_THRESHOLD) {
		return { type: "up" as const, value: Math.abs(percentageChange) };
	}
	if (percentageChange < -TREND_THRESHOLD) {
		return { type: "down" as const, value: Math.abs(percentageChange) };
	}
	return { type: "neutral" as const, value: Math.abs(percentageChange) };
};

interface ActiveUsersRow {
	websiteId: string;
	activeUsers: number;
}

const fetchActiveUsers = async (
	websiteIds: string[]
): Promise<Record<string, number>> => {
	if (!websiteIds.length) {
		return {};
	}

	const query = `
    SELECT
      client_id AS websiteId,
      uniq(anonymous_id) AS activeUsers
    FROM analytics.events
    WHERE
      client_id IN {websiteIds:Array(String)}
      AND event_name = 'screen_view'
      AND session_id != ''
      AND time >= now() - INTERVAL 5 MINUTE
    GROUP BY client_id
  `;

	const results = await chQuery<ActiveUsersRow>(query, { websiteIds });

	const activeUsersMap: Record<string, number> = {};
	for (const id of websiteIds) {
		activeUsersMap[id] = 0;
	}
	for (const row of results) {
		activeUsersMap[row.websiteId] = row.activeUsers;
	}

	return activeUsersMap;
};

const fetchChartData = async (
	websiteIds: string[]
): Promise<Record<string, ProcessedMiniChartData>> => {
	if (!websiteIds.length) {
		return {};
	}

	const chartQuery = `
    WITH
      date_range AS (
        SELECT arrayJoin(arrayMap(d -> toDate(today()) - d, range(7))) AS date
      ),
      daily_pageviews AS (
        SELECT
          client_id,
          toDate(time) as event_date,
          countIf(event_name = 'screen_view') as pageviews
        FROM analytics.events
        WHERE
          client_id IN {websiteIds:Array(String)}
          AND toDate(time) >= (today() - 6)
        GROUP BY client_id, event_date
      ),
      has_any_data AS (
        SELECT client_id, 1 AS hasData
        FROM analytics.events
        WHERE client_id IN {websiteIds:Array(String)} AND event_name = 'screen_view'
        GROUP BY client_id
      )
    SELECT
      all_websites.website_id AS websiteId,
      toString(date_range.date) AS date,
      COALESCE(daily_pageviews.pageviews, 0) AS value,
      COALESCE(has_any_data.hasData, 0) AS hasAnyData
    FROM
      (SELECT arrayJoin({websiteIds:Array(String)}) AS website_id) AS all_websites
    CROSS JOIN
      date_range
    LEFT JOIN
      daily_pageviews ON all_websites.website_id = daily_pageviews.client_id AND date_range.date = daily_pageviews.event_date
    LEFT JOIN
      has_any_data ON all_websites.website_id = has_any_data.client_id
    ORDER BY
      websiteId,
      date ASC
  `;

	const queryResults = await chQuery<ChartDataPoint>(chartQuery, {
		websiteIds,
	});

	const groupedData = websiteIds.reduce(
		(acc, id) => {
			acc[id] = { points: [], hasAnyData: false };
			return acc;
		},
		{} as Record<string, { points: { date: string; value: number }[]; hasAnyData: boolean }>
	);

	for (const row of queryResults) {
		if (groupedData[row.websiteId]) {
			groupedData[row.websiteId].points.push({ date: row.date, value: row.value });
			if (row.hasAnyData === 1) {
				groupedData[row.websiteId].hasAnyData = true;
			}
		}
	}

	const processedData: Record<string, ProcessedMiniChartData> = {};

	for (const websiteId of websiteIds) {
		const { points, hasAnyData } = groupedData[websiteId];
		const totalViews = points.reduce((sum, point) => sum + point.value, 0);
		const trend = calculateTrend(points);

		processedData[websiteId] = {
			data: points,
			totalViews,
			hasAnyData,
			trend,
		};
	}

	return processedData;
};

export const websitesRouter = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.handler(({ context, input }) => {
			const listCacheKey = `list:${context.user.id}:${input.organizationId || ""}`;
			return websiteCache.withCache({
				key: listCacheKey,
				ttl: CACHE_DURATION,
				tables: ["websites"],
				queryFn: async () => {
					if (input.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: context.headers,
							body: { permissions: { website: ["read"] } },
						});
						if (!success) {
							throw new ORPCError("FORBIDDEN", {
								message: "Missing organization permissions.",
							});
						}
					}
					const whereClause = buildWebsiteFilter(
						context.user.id,
						input.organizationId
					);
					return context.db.query.websites.findMany({
						where: whereClause,
						orderBy: (table, { desc }) => [desc(table.createdAt)],
					});
				},
			});
		}),

	listAll: protectedProcedure.handler(({ context }) => {
		const listAllCacheKey = `listAll:${context.user.id}`;
		return websiteCache.withCache({
			key: listAllCacheKey,
			ttl: CACHE_DURATION,
			tables: ["websites"],
			queryFn: async () => {
				// 1. Get user's organization memberships
				const userMemberships = await context.db.query.member.findMany({
					where: eq(member.userId, context.user.id),
					columns: { organizationId: true },
				});
				const orgIds = userMemberships.map((m) => m.organizationId);

				// 2. Build filter: (userId = me AND orgId is null) OR (orgId IN myOrgs)
				const personalSites = and(
					eq(websites.userId, context.user.id),
					isNull(websites.organizationId)
				);

				const orgSites =
					orgIds.length > 0
						? inArray(websites.organizationId, orgIds)
						: undefined;

				const whereClause = orgSites
					? or(personalSites, orgSites)
					: personalSites;

				return context.db.query.websites.findMany({
					where: whereClause,
					orderBy: (table, { desc }) => [desc(table.createdAt)],
				});
			},
		});
	}),

	listWithCharts: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.handler(({ context, input }) => {
			const chartsListCacheKey = `listWithCharts:${context.user.id}:${input.organizationId || ""}`;

			return websiteCache.withCache({
				key: chartsListCacheKey,
				ttl: CACHE_DURATION,
				tables: ["websites"],
				queryFn: async () => {
					if (input.organizationId) {
						const { success } = await websitesApi.hasPermission({
							headers: context.headers,
							body: { permissions: { website: ["read"] } },
						});
						if (!success) {
							throw new ORPCError("FORBIDDEN", {
								message: "Missing organization permissions.",
							});
						}
					}
					const whereClause = buildWebsiteFilter(
						context.user.id,
						input.organizationId
					);

					const websites = await context.db.query.websites.findMany({
						where: whereClause,
						orderBy: (table, { desc }) => [desc(table.createdAt)],
					});

					const websiteIds = websites.map((site) => site.id);
					const [chartData, activeUsers] = await Promise.all([
						fetchChartData(websiteIds),
						fetchActiveUsers(websiteIds),
					]);

					return {
						websites,
						chartData,
						activeUsers,
					};
				},
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const authContext = await getCacheAuthContext(context, {
				websiteId: input.id,
			});

			return websiteCache.withCache({
				key: `getById:${input.id}:${authContext}`,
				ttl: CACHE_DURATION,
				tables: ["websites"],
				queryFn: async () => {
					const website = await authorizeWebsiteAccess(
						context,
						input.id,
						"read"
					);

					const isPublicAccess = authContext === "public";

					if (isPublicAccess) {
						return {
							id: website.id,
							domain: website.domain,
							name: website.name,
							status: website.status,
							isPublic: website.isPublic,
							createdAt: website.createdAt,
							updatedAt: website.updatedAt,
						};
					}

					return website;
				},
			});
		}),

	create: protectedProcedure
		.input(createWebsiteSchema)
		.handler(async ({ context, input }) => {
			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: context.headers,
					body: { permissions: { website: ["create"] } },
				});
				if (!success) {
					throw new ORPCError("FORBIDDEN", {
						message: "Missing organization permissions.",
					});
				}
			}

			const serviceInput = {
				name: input.name,
				domain: input.domain,
				userId: context.user.id,
				organizationId: input.organizationId,
				status: "ACTIVE" as const,
			};

			try {
				return await websiteService.create(serviceInput);
			} catch (error) {
				if (error instanceof ValidationError) {
					throw new ORPCError("BAD_REQUEST", {
						message: error.message,
					});
				}
				if (error instanceof DuplicateDomainError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	update: protectedProcedure
		.input(updateWebsiteSchema)
		.handler(async ({ context, input }) => {
			const websiteToUpdate = await authorizeWebsiteAccess(
				context,
				input.id,
				"update"
			);

			const serviceInput: { name?: string; domain?: string } = {};
			if (input.name !== undefined) {
				serviceInput.name = input.name;
			}
			if (input.domain !== undefined) {
				serviceInput.domain = input.domain;
			}

			let updatedWebsite: Website;
			try {
				updatedWebsite = await websiteService.updateById(
					input.id,
					serviceInput
				);
			} catch (error) {
				if (error instanceof ValidationError) {
					throw new ORPCError("BAD_REQUEST", {
						message: error.message,
					});
				}
				if (error instanceof DuplicateDomainError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				if (error instanceof WebsiteNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}

			const changes: string[] = [];
			if (input.name !== websiteToUpdate.name) {
				changes.push(`name: "${websiteToUpdate.name}" → "${input.name}"`);
			}
			if (input.domain && input.domain !== websiteToUpdate.domain) {
				changes.push(
					`domain: "${websiteToUpdate.domain}" → "${updatedWebsite.domain}"`
				);
			}

			if (changes.length > 0) {
				logger.info(
					{
						websiteId: updatedWebsite.id,
						userId: context.user.id,
					},
					`Website Updated: ${changes.join(", ")}`
				);
			}

			return updatedWebsite;
		}),

	togglePublic: protectedProcedure
		.input(togglePublicWebsiteSchema)
		.handler(async ({ context, input }) => {
			const website = await authorizeWebsiteAccess(context, input.id, "update");

			let updatedWebsite: Website;
			try {
				updatedWebsite = await websiteService.updateById(input.id, {
					isPublic: input.isPublic,
				});
			} catch (error) {
				if (error instanceof WebsiteNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}

			logger.info(
				{
					websiteId: input.id,
					isPublic: input.isPublic,
					userId: context.user.id,
					event: "Website Privacy Updated",
				},
				`${website.domain} is now ${input.isPublic ? "public" : "private"}`
			);

			return updatedWebsite;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const websiteToDelete = await authorizeWebsiteAccess(
				context,
				input.id,
				"delete"
			);

			try {
				await websiteService.deleteById(input.id);
			} catch (error) {
				if (error instanceof WebsiteNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}

			logger.warn(
				{
					websiteId: websiteToDelete.id,
					websiteName: websiteToDelete.name,
					domain: websiteToDelete.domain,
					userId: context.user.id,
					event: "Website Deleted",
				},
				`Website "${websiteToDelete.name}" with domain "${websiteToDelete.domain}" was deleted`
			);

			return { success: true };
		}),

	transfer: protectedProcedure
		.input(transferWebsiteSchema)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");

			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: context.headers,
					body: {
						organizationId: input.organizationId,
						permissions: { website: ["create"] },
					},
				});
				if (!success) {
					throw new ORPCError("FORBIDDEN", {
						message: "Missing organization permissions.",
					});
				}
			}

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.organizationId ?? null,
				});
			} catch (error) {
				if (error instanceof DuplicateDomainError) {
					throw new ORPCError("CONFLICT", {
						message:
							"A website with this domain already exists in the destination. Please remove or rename the existing website first.",
					});
				}
				if (error instanceof WebsiteNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	transferToOrganization: protectedProcedure
		.input(transferWebsiteToOrgSchema)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "transfer");

			const { success } = await websitesApi.hasPermission({
				headers: context.headers,
				body: {
					organizationId: input.targetOrganizationId,
					permissions: { website: ["create"] },
				},
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Missing permissions to transfer website to target organization.",
				});
			}

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.targetOrganizationId,
				});
			} catch (error) {
				if (error instanceof DuplicateDomainError) {
					throw new ORPCError("CONFLICT", {
						message:
							"A website with this domain already exists in the destination. Please remove or rename the existing website first.",
					});
				}
				if (error instanceof WebsiteNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	invalidateCaches: protectedProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");

			try {
				await invalidateWebsiteCaches(input.websiteId, context.user.id);
			} catch {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to invalidate caches",
				});
			}

			return { success: true };
		}),

	isTrackingSetup: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(async ({ context, input }) => {
			try {
				await authorizeWebsiteAccess(context, input.websiteId, "read");

				const { hasEvents, error: eventsError } = await getTrackingEventsStatus(
					input.websiteId
				);

				return {
					tracking_setup: hasEvents,
					integration_type: hasEvents ? "manual" : null,
					has_events: hasEvents,
					status_message: buildStatusMessage(hasEvents, eventsError),
				};
			} catch (error) {
				if (error instanceof ORPCError) {
					if (error.code === "NOT_FOUND") {
						throw new ORPCError("NOT_FOUND", {
							message: `Website with ID "${input.websiteId}" not found. Please verify the website ID is correct.`,
						});
					}
					throw error;
				}
				logger.error(
					{ websiteId: input.websiteId },
					`Error in isTrackingSetup: ${error instanceof Error ? error.message : String(error)}`
				);
				throw error;
			}
		}),
};
