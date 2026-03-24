import { chQuery, db, eq, websites } from "@databuddy/db";
import {
	DuplicateDomainError,
	ValidationError,
	type Website,
	WebsiteNotFoundError,
	WebsiteService,
} from "@databuddy/services/websites";
import type { ProcessedMiniChartData } from "@databuddy/shared/types/website";
import {
	createWebsiteSchema,
	togglePublicWebsiteSchema,
	transferWebsiteSchema,
	transferWebsiteToOrgSchema,
	updateWebsiteSchema,
	updateWebsiteSettingsSchema,
} from "@databuddy/validation";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import {
	generateExport,
	validateExportDateRange,
} from "../services/export-service";

const websiteService = new WebsiteService(db);
const TREND_THRESHOLD = 5;

function handleServiceError(error: unknown): never {
	if (error instanceof ValidationError) {
		throw rpcError.badRequest(error.message);
	}
	if (error instanceof DuplicateDomainError) {
		throw rpcError.conflict(error.message);
	}
	if (error instanceof WebsiteNotFoundError) {
		throw rpcError.notFound("website");
	}
	throw rpcError.internal(
		error instanceof Error ? error.message : String(error)
	);
}

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

const websiteOutputSchema = z.record(z.string(), z.unknown());
const successOutputSchema = z.object({ success: z.literal(true) });

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
      aggregated_pageviews AS (
        SELECT
          client_id,
          date,
          sum(pageviews) AS pageviews
        FROM analytics.daily_pageviews
        WHERE client_id IN {websiteIds:Array(String)}
          AND date >= (today() - 6)
        GROUP BY client_id, date
      ),
      has_any_data AS (
        SELECT client_id, 1 AS hasData
        FROM analytics.daily_pageviews
        WHERE client_id IN {websiteIds:Array(String)}
          AND pageviews > 0
        GROUP BY client_id
      )
    SELECT
      all_websites.website_id AS websiteId,
      toString(date_range.date) AS date,
      COALESCE(aggregated_pageviews.pageviews, 0) AS value,
      COALESCE(has_any_data.hasData, 0) AS hasAnyData
    FROM
      (SELECT arrayJoin({websiteIds:Array(String)}) AS website_id) AS all_websites
    CROSS JOIN
      date_range
    LEFT JOIN
      aggregated_pageviews ON all_websites.website_id = aggregated_pageviews.client_id AND date_range.date = aggregated_pageviews.date
    LEFT JOIN
      has_any_data ON all_websites.website_id = has_any_data.client_id
    WHERE
      date_range.date >= (today() - 6)
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
		{} as Record<
			string,
			{ points: { date: string; value: number }[]; hasAnyData: boolean }
		>
	);

	for (const row of queryResults) {
		if (groupedData[row.websiteId]) {
			groupedData[row.websiteId].points.push({
				date: row.date,
				value: row.value,
			});
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
		.route({
			description: "Returns websites for the active workspace.",
			method: "POST",
			path: "/websites/list",
			summary: "List websites",
			tags: ["Websites"],
		})
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.output(z.array(websiteOutputSchema))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			return context.db.query.websites.findMany({
				where: eq(websites.organizationId, workspace.organizationId as string),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
		}),

	listWithCharts: protectedProcedure
		.route({
			description: "Returns websites with chart data and active users.",
			method: "POST",
			path: "/websites/listWithCharts",
			summary: "List websites with charts",
			tags: ["Websites"],
		})
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			const websitesList = await context.db.query.websites.findMany({
				where: eq(websites.organizationId, workspace.organizationId as string),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});

			const websiteIds = websitesList.map((site) => site.id);
			const [chartData, activeUsers] = await Promise.all([
				fetchChartData(websiteIds),
				fetchActiveUsers(websiteIds),
			]);

			return { websites: websitesList, chartData, activeUsers };
		}),

	getById: publicProcedure
		.route({
			description: "Returns a website by id. Supports public access.",
			method: "POST",
			path: "/websites/getById",
			summary: "Get website",
			tags: ["Websites"],
		})
		.input(z.object({ id: z.string() }))
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.id,
				permissions: ["read"],
				allowPublicAccess: true,
			});

			if (workspace.isPublicAccess) {
				return {
					id: workspace.website!.id,
					domain: workspace.website!.domain,
					name: workspace.website!.name,
					status: workspace.website!.status,
					isPublic: workspace.website!.isPublic,
					createdAt: workspace.website!.createdAt,
					updatedAt: workspace.website!.updatedAt,
				};
			}

			return workspace.website!;
		}),

	create: protectedProcedure
		.route({
			description: "Creates a website. Requires workspace create permission.",
			method: "POST",
			path: "/websites/create",
			summary: "Create website",
			tags: ["Websites"],
		})
		.input(createWebsiteSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			if (!input.organizationId) {
				throw rpcError.badRequest("Website must belong to a workspace");
			}

			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["create"],
			});

			try {
				return await websiteService.create({
					name: input.name,
					domain: input.domain,
					organizationId: input.organizationId,
					status: "ACTIVE" as const,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	update: protectedProcedure
		.route({
			description: "Updates a website. Requires update permission.",
			method: "POST",
			path: "/websites/update",
			summary: "Update website",
			tags: ["Websites"],
		})
		.input(updateWebsiteSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			const { website: websiteToUpdate } = await withWorkspace(context, {
				websiteId: input.id,
				permissions: ["update"],
			});

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
				handleServiceError(error);
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
					{ websiteId: updatedWebsite.id, userId: context.user?.id },
					`Website Updated: ${changes.join(", ")}`
				);
			}

			return updatedWebsite;
		}),

	togglePublic: protectedProcedure
		.route({
			description:
				"Toggles website public/private. Requires update permission.",
			method: "POST",
			path: "/websites/togglePublic",
			summary: "Toggle public",
			tags: ["Websites"],
		})
		.input(togglePublicWebsiteSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			const { website } = await withWorkspace(context, {
				websiteId: input.id,
				permissions: ["update"],
			});

			let updatedWebsite: Website;
			try {
				updatedWebsite = await websiteService.updateById(input.id, {
					isPublic: input.isPublic,
				});
			} catch (error) {
				handleServiceError(error);
			}

			logger.info(
				{
					websiteId: input.id,
					isPublic: input.isPublic,
					userId: context.user?.id,
					event: "Website Privacy Updated",
				},
				`${website.domain} is now ${input.isPublic ? "public" : "private"}`
			);

			return updatedWebsite;
		}),

	delete: protectedProcedure
		.route({
			description: "Deletes a website. Requires delete permission.",
			method: "POST",
			path: "/websites/delete",
			summary: "Delete website",
			tags: ["Websites"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const { website: websiteToDelete } = await withWorkspace(context, {
				websiteId: input.id,
				permissions: ["delete"],
			});

			try {
				await websiteService.deleteById(input.id);
			} catch (error) {
				handleServiceError(error);
			}

			logger.warn(
				{
					websiteId: websiteToDelete.id,
					websiteName: websiteToDelete.name,
					domain: websiteToDelete.domain,
					userId: context.user?.id,
					event: "Website Deleted",
				},
				`Website "${websiteToDelete.name}" with domain "${websiteToDelete.domain}" was deleted`
			);

			return { success: true };
		}),

	transfer: protectedProcedure
		.route({
			description: "Transfers website to another workspace.",
			method: "POST",
			path: "/websites/transfer",
			summary: "Transfer website",
			tags: ["Websites"],
		})
		.input(transferWebsiteSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
			});

			if (!input.organizationId) {
				throw rpcError.badRequest("Website must be transferred to a workspace");
			}

			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["create"],
			});

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.organizationId,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	transferToOrganization: protectedProcedure
		.route({
			description: "Transfers website to target organization.",
			method: "POST",
			path: "/websites/transferToOrganization",
			summary: "Transfer to organization",
			tags: ["Websites"],
		})
		.input(transferWebsiteToOrgSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
			});

			await withWorkspace(context, {
				organizationId: input.targetOrganizationId,
				resource: "website",
				permissions: ["create"],
			});

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.targetOrganizationId,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	isTrackingSetup: publicProcedure
		.route({
			description: "Checks if tracking is set up for a website.",
			method: "POST",
			path: "/websites/isTrackingSetup",
			summary: "Check tracking setup",
			tags: ["Websites"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
				allowPublicAccess: true,
			});

			const { hasEvents, error: eventsError } = await getTrackingEventsStatus(
				input.websiteId
			);

			return {
				tracking_setup: hasEvents,
				integration_type: hasEvents ? "manual" : null,
				has_events: hasEvents,
				status_message: buildStatusMessage(hasEvents, eventsError),
			};
		}),

	updateSettings: protectedProcedure
		.route({
			description: "Updates website settings. Requires update permission.",
			method: "POST",
			path: "/websites/updateSettings",
			summary: "Update settings",
			tags: ["Websites"],
		})
		.input(updateWebsiteSettingsSchema)
		.output(websiteOutputSchema)
		.handler(async ({ context, input }) => {
			const { website } = await withWorkspace(context, {
				websiteId: input.id,
				permissions: ["update"],
			});

			const currentSettings =
				(website.settings as {
					allowedOrigins?: string[];
					allowedIps?: string[];
				}) ?? {};

			const newSettings = {
				...currentSettings,
				...(input.settings?.allowedOrigins !== undefined && {
					allowedOrigins:
						input.settings.allowedOrigins.length > 0
							? input.settings.allowedOrigins
							: undefined,
				}),
				...(input.settings?.allowedIps !== undefined && {
					allowedIps:
						input.settings.allowedIps.length > 0
							? input.settings.allowedIps
							: undefined,
				}),
			};

			const cleanedSettings = Object.fromEntries(
				Object.entries(newSettings).filter(([_, v]) => v !== undefined)
			);

			let updatedWebsite: Website;
			try {
				updatedWebsite = await websiteService.updateById(input.id, {
					settings:
						Object.keys(cleanedSettings).length > 0 ? cleanedSettings : null,
				});
			} catch (error) {
				handleServiceError(error);
			}

			logger.info(
				{
					websiteId: input.id,
					userId: context.user?.id,
					event: "Website Settings Updated",
				},
				`Security settings updated for ${website.domain}`
			);

			return updatedWebsite;
		}),

	exportDownload: protectedProcedure
		.route({
			description: "Downloads analytics export. Requires read permission.",
			method: "POST",
			path: "/websites/exportDownload",
			summary: "Download export",
			tags: ["Websites"],
		})
		.input(
			z.object({
				websiteId: z.string().min(1),
				format: z.enum(["csv", "json", "txt", "proto"]).default("json"),
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional(),
				endDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional(),
			})
		)
		.output(
			z.object({
				filename: z.string(),
				data: z.string(),
				metadata: z.record(z.string(), z.unknown()),
			})
		)
		.handler(async ({ context, input }) => {
			const { dates, error } = validateExportDateRange(
				input.startDate,
				input.endDate
			);

			if (error) {
				throw rpcError.badRequest(error);
			}

			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const exportResult = await generateExport(
				input.websiteId,
				input.format,
				dates.startDate,
				dates.endDate
			);

			return {
				filename: exportResult.filename,
				data: exportResult.buffer.toString("base64"),
				metadata: exportResult.meta as unknown as Record<string, unknown>,
			};
		}),
};
