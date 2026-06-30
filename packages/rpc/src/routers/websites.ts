import { db } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { cacheable } from "@databuddy/redis";
import {
	getTrackingBlockOriginHost,
	isIgnoredTrackingBlockOrigin,
	matchesTrackingBlockAllowedOrigin,
	matchesTrackingBlockIgnoredOrigin,
	type ActionableTrackingBlockReason,
} from "@databuddy/shared/tracking-blocks";
import {
	DuplicateDomainError,
	ValidationError,
	type Website,
	WebsiteNotFoundError,
	WebsiteService,
} from "@databuddy/services/websites";
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
import { protectedProcedure, publicProcedure, trackedProcedure } from "../orpc";
import { setTrackProperties } from "../middleware/track-mutation";
import { authorizeTransfer } from "../procedures/with-resource";
import {
	withPublicWorkspace,
	withWorkspace,
} from "../procedures/with-workspace";
import {
	generateExport,
	validateExportDateRange,
} from "../services/export-service";
import { mergeWebsiteSecuritySettings } from "./website-settings";
import {
	type ChartDataRow,
	type ProcessedMiniChartData,
	processChartData,
} from "./websites-chart";

const websiteService = new WebsiteService(db);

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
	throw rpcError.internal("Website operation failed");
}

const TRACKING_HEALTH_WINDOW_HOURS = 24;
const TRACKING_ISSUE_MIN_BLOCKS = 3;
const TRACKING_ISSUE_TYPES = [
	"origin_not_authorized",
	"ip_not_authorized",
] as const satisfies readonly ActionableTrackingBlockReason[];

type TrackingIssueType = (typeof TRACKING_ISSUE_TYPES)[number];
type TrackingIssueSeverity = "critical" | "warning";

interface EventsCheckResult {
	error: string | null;
	hasEvents: boolean;
	recentEvents: number;
}

interface BlockedTrackingIssueRow {
	count: number;
	issueType: string;
	lastSeen: string | null;
	origin: string | null;
}

interface TrackingIssue {
	count: number;
	expectedDomain: string | null;
	fix: string;
	lastSeen: string | null;
	message: string;
	origin: string | null;
	originHost: string | null;
	severity: TrackingIssueSeverity;
	type: TrackingIssueType;
}

function buildTrackingIssue(
	row: BlockedTrackingIssueRow,
	websiteDomain: string | null,
	recentEvents: number
): TrackingIssue | null {
	if (!isDashboardTrackingIssueType(row.issueType)) {
		return null;
	}

	const severity: TrackingIssueSeverity =
		recentEvents === 0 ? "critical" : "warning";
	const originHost = getTrackingBlockOriginHost(row.origin);
	const expectedDomain = websiteDomain || null;

	if (row.issueType === "origin_not_authorized") {
		const source = originHost ? ` from ${originHost}` : "";
		const expected = expectedDomain ? ` (${expectedDomain})` : "";
		const fix = originHost
			? `Update the website domain to ${originHost}, or add ${originHost} under Security → Allowed Origins if this is an additional trusted domain.`
			: "Update the website domain or add the trusted origin under Security → Allowed Origins.";

		return {
			count: row.count,
			expectedDomain,
			fix,
			lastSeen: row.lastSeen,
			message: `Recent tracking requests${source} are being blocked because they do not match the configured domain${expected}.`,
			origin: row.origin || null,
			originHost,
			severity,
			type: row.issueType,
		};
	}

	return {
		count: row.count,
		expectedDomain,
		fix: "Update the website IP allowlist or remove the restriction if browser traffic should be accepted from dynamic client IPs.",
		lastSeen: row.lastSeen,
		message:
			"Recent tracking requests are being blocked by this website's IP allowlist.",
		origin: row.origin || null,
		originHost,
		severity,
		type: row.issueType,
	};
}

function isDashboardTrackingIssueType(
	issueType: string
): issueType is TrackingIssueType {
	return (TRACKING_ISSUE_TYPES as readonly string[]).includes(issueType);
}

async function getTrackingEventsStatus(
	websiteId: string
): Promise<EventsCheckResult> {
	try {
		const trackingCheckResult = await Promise.race([
			chQuery<{ count: number; recentCount: number }>(
				`SELECT
					countIf(event_name = 'screen_view') AS count,
					countIf(event_name = 'screen_view' AND time >= now() - INTERVAL ${TRACKING_HEALTH_WINDOW_HOURS} HOUR) AS recentCount
				FROM analytics.events
				PREWHERE client_id = {websiteId:String}`,
				{ websiteId }
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("ClickHouse query timeout")), 10_000)
			),
		]);

		const row = trackingCheckResult[0];
		return {
			hasEvents: (row?.count ?? 0) > 0,
			recentEvents: row?.recentCount ?? 0,
			error: null,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error checking events";
		logger.error({ websiteId }, `Error checking tracking events: ${message}`);
		return { hasEvents: false, recentEvents: 0, error: message };
	}
}

function shouldSkipBlockedTrackingIssueRow(
	row: BlockedTrackingIssueRow,
	options: {
		allowedOrigins: string[];
		ignoredOrigins: string[];
		websiteDomain: string | null;
	}
): boolean {
	if (isIgnoredTrackingBlockOrigin(row.origin)) {
		return true;
	}

	if (matchesTrackingBlockIgnoredOrigin(row.origin, options.ignoredOrigins)) {
		return true;
	}

	return (
		row.issueType === "origin_not_authorized" &&
		matchesTrackingBlockAllowedOrigin(
			row.origin,
			options.websiteDomain,
			options.allowedOrigins
		)
	);
}

async function getRecentBlockedTrackingIssue(
	websiteId: string,
	options: {
		allowedOrigins: string[];
		ignoredOrigins: string[];
		websiteDomain: string | null;
	}
): Promise<BlockedTrackingIssueRow | null> {
	try {
		const rows = await Promise.race([
			chQuery<BlockedTrackingIssueRow>(
				`SELECT
					block_reason AS issueType,
					ifNull(origin, '') AS origin,
					count() AS count,
					toString(max(timestamp)) AS lastSeen
				FROM analytics.blocked_traffic
				PREWHERE timestamp >= now() - INTERVAL ${TRACKING_HEALTH_WINDOW_HOURS} HOUR
				WHERE client_id = {websiteId:String}
					AND block_reason IN {issueTypes:Array(String)}
				GROUP BY issueType, origin
				HAVING count >= {minBlocks:UInt32}
				ORDER BY count DESC, lastSeen DESC
				LIMIT 100`,
				{
					issueTypes: [...TRACKING_ISSUE_TYPES],
					minBlocks: TRACKING_ISSUE_MIN_BLOCKS,
					websiteId,
				}
			),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("ClickHouse query timeout")), 10_000)
			),
		]);

		return (
			rows.find((row) => !shouldSkipBlockedTrackingIssueRow(row, options)) ??
			null
		);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unknown error checking blocked traffic";
		logger.error({ websiteId }, `Error checking blocked traffic: ${message}`);
		return null;
	}
}

const buildStatusMessage = (
	status: EventsCheckResult,
	issue: TrackingIssue | null
) => {
	if (issue?.severity === "critical") {
		return issue.message;
	}

	if (status.hasEvents && issue) {
		return "Tracking is receiving events, but some recent requests are blocked by security settings.";
	}

	if (status.hasEvents) {
		return "Tracking is active and receiving events.";
	}

	if (status.error) {
		return "Unable to check events. Try again shortly.";
	}

	return "Tracking not set up. Please install the script tag.";
};

const websiteStatusOutputSchema = z.enum([
	"ACTIVE",
	"HEALTHY",
	"UNHEALTHY",
	"INACTIVE",
	"PENDING",
]);

const websiteSettingsSchema = z
	.object({
		allowedOrigins: z.array(z.string()).optional(),
		allowedIps: z.array(z.string()).optional(),
		ignoredTrackingOrigins: z.array(z.string()).optional(),
		trackingIssueWarningsDisabled: z.boolean().optional(),
	})
	.nullable();

const websiteOutputSchema = z.object({
	id: z.string(),
	domain: z.string(),
	name: z.string().nullable(),
	status: websiteStatusOutputSchema,
	isPublic: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	organizationId: z.string(),
	deletedAt: z.coerce.date().nullable(),
	integrations: z.record(z.string(), z.unknown()).nullable(),
	settings: websiteSettingsSchema,
});

const publicWebsiteSummarySchema = z.object({
	id: z.string(),
	domain: z.string(),
	name: z.string().nullable(),
	status: websiteStatusOutputSchema,
	isPublic: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const processedMiniChartDataSchema = z.object({
	data: z.array(
		z.object({
			date: z.string(),
			value: z.number(),
		})
	),
	totalViews: z.number(),
	hasAnyData: z.boolean(),
	hasHistoricalData: z.boolean(),
	trend: z
		.object({
			type: z.enum(["up", "down", "neutral"]),
			value: z.number(),
		})
		.nullable(),
});

const listWithChartsOutputSchema = z.object({
	websites: z.array(websiteOutputSchema),
	chartData: z.record(z.string(), processedMiniChartDataSchema),
	activeUsers: z.record(z.string(), z.number()),
});

const successOutputSchema = z.object({ success: z.literal(true) });

const trackingIssueOutputSchema = z.object({
	count: z.number(),
	expectedDomain: z.string().nullable(),
	fix: z.string(),
	lastSeen: z.string().nullable(),
	message: z.string(),
	origin: z.string().nullable(),
	originHost: z.string().nullable(),
	severity: z.enum(["critical", "warning"]),
	type: z.enum(TRACKING_ISSUE_TYPES),
});

const trackingSetupOutputSchema = z.object({
	tracking_setup: z.boolean(),
	integration_type: z.string().nullable(),
	has_events: z.boolean(),
	recent_events: z.number(),
	status_message: z.string(),
	tracking_issue: trackingIssueOutputSchema.nullable(),
});

export type WebsiteOutput = z.infer<typeof websiteOutputSchema>;

interface ActiveUsersRow {
	activeUsers: number;
	websiteId: string;
}

const _fetchActiveUsers = async (
	websiteIds: string[]
): Promise<Record<string, number>> => {
	if (!websiteIds.length) {
		return {};
	}

	const results = await chQuery<ActiveUsersRow>(
		`SELECT
			client_id AS websiteId,
			uniq(anonymous_id) AS activeUsers
		FROM analytics.events
		PREWHERE time >= now() - INTERVAL 5 MINUTE
		WHERE
			client_id IN {websiteIds:Array(String)}
			AND event_name = 'screen_view'
			AND session_id != ''
		GROUP BY client_id`,
		{ websiteIds }
	);

	const activeUsersMap: Record<string, number> = {};
	for (const id of websiteIds) {
		activeUsersMap[id] = 0;
	}
	for (const row of results) {
		activeUsersMap[row.websiteId] = row.activeUsers;
	}

	return activeUsersMap;
};

const fetchActiveUsers = cacheable(_fetchActiveUsers, {
	expireInSec: 60,
	prefix: "ch:active_users",
});

const _fetchChartData = async (
	websiteIds: string[]
): Promise<Record<string, ProcessedMiniChartData>> => {
	if (!websiteIds.length) {
		return {};
	}

	const [queryResults, historicalRows] = await Promise.all([
		chQuery<ChartDataRow>(
			`WITH
				date_range AS (
					SELECT arrayJoin(arrayMap(d -> toDate(today()) - d, range(7))) AS date
				),
				aggregated AS (
					SELECT
						client_id,
						date,
						sum(pageviews) AS pageviews,
						1 AS hasData
					FROM analytics.daily_pageviews
					WHERE client_id IN {websiteIds:Array(String)}
						AND date >= (today() - 6)
					GROUP BY client_id, date
				)
			SELECT
				all_websites.website_id AS websiteId,
				toString(date_range.date) AS date,
				COALESCE(aggregated.pageviews, 0) AS value,
				COALESCE(aggregated.hasData, 0) AS hasAnyData
			FROM
				(SELECT arrayJoin({websiteIds:Array(String)}) AS website_id) AS all_websites
			CROSS JOIN date_range
			LEFT JOIN aggregated
				ON all_websites.website_id = aggregated.client_id
				AND date_range.date = aggregated.date
			WHERE date_range.date >= (today() - 6)
			ORDER BY websiteId, date ASC`,
			{ websiteIds }
		),
		chQuery<{ websiteId: string }>(
			`SELECT DISTINCT client_id AS websiteId
			FROM analytics.daily_pageviews
			WHERE client_id IN {websiteIds:Array(String)}`,
			{ websiteIds }
		),
	]);

	return processChartData(websiteIds, queryResults, historicalRows);
};

const fetchChartData = cacheable(_fetchChartData, {
	expireInSec: 300,
	prefix: "ch:chart_data",
	staleWhileRevalidate: true,
	staleTime: 60,
});

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

			if (!workspace.organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			return websiteService.list(workspace.organizationId);
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
		.output(listWithChartsOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			if (!workspace.organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			const websitesList = await websiteService.list(workspace.organizationId);

			const websiteIds = websitesList.map((site) => site.id);
			const [chartData, activeUsers] = await Promise.all([
				fetchChartData(websiteIds),
				fetchActiveUsers(websiteIds),
			]);

			return { websites: websitesList, chartData, activeUsers };
		}),

	getById: protectedProcedure
		.route({
			description: "Returns a website by id. Requires website read permission.",
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
			});

			const site = workspace.website;
			if (!site) {
				throw rpcError.notFound("website");
			}
			return site;
		}),

	getPublicSummary: publicProcedure
		.route({
			description:
				"Returns minimal public-overview metadata for a website (id, domain, name, status). Public websites only.",
			method: "POST",
			path: "/websites/getPublicSummary",
			summary: "Get public website summary",
			tags: ["Websites"],
		})
		.input(z.object({ id: z.string() }))
		.output(publicWebsiteSummarySchema)
		.handler(async ({ context, input }) => {
			const workspace = await withPublicWorkspace(context, {
				websiteId: input.id,
				permissions: ["read"],
			});

			const site = workspace.website;
			if (!site) {
				throw rpcError.notFound("website");
			}
			return {
				id: site.id,
				domain: site.domain,
				name: site.name,
				status: site.status,
				isPublic: site.isPublic,
				createdAt: site.createdAt,
				updatedAt: site.updatedAt,
			};
		}),

	create: trackedProcedure
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
			const workspace = await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "website",
				permissions: ["create"],
			});

			try {
				return await websiteService.create({
					name: input.name,
					domain: input.domain,
					organizationId: workspace.organizationId,
					status: "ACTIVE" as const,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	update: trackedProcedure
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

	togglePublic: trackedProcedure
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
			setTrackProperties({ is_public: input.isPublic });
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

	delete: trackedProcedure
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

	transfer: trackedProcedure
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
			if (!input.organizationId) {
				throw rpcError.badRequest("Website must be transferred to a workspace");
			}

			await authorizeTransfer(context, {
				resource: "website",
				id: input.websiteId,
				targetOrganizationId: input.organizationId,
			});

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.organizationId,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	transferToOrganization: trackedProcedure
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
			await authorizeTransfer(context, {
				resource: "website",
				id: input.websiteId,
				targetOrganizationId: input.targetOrganizationId,
			});

			try {
				return await websiteService.updateById(input.websiteId, {
					organizationId: input.targetOrganizationId,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	isTrackingSetup: protectedProcedure
		.route({
			description:
				"Checks if tracking is set up for a website. Requires website read permission.",
			method: "POST",
			path: "/websites/isTrackingSetup",
			summary: "Check tracking setup",
			tags: ["Websites"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(trackingSetupOutputSchema)
		.handler(async ({ context, input }) => {
			const { website } = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});
			const websiteSettings = website?.settings ?? null;
			const trackingIssueWarningsDisabled =
				websiteSettings?.trackingIssueWarningsDisabled === true;

			const [eventsStatus, blockedIssueRow] = await Promise.all([
				getTrackingEventsStatus(input.websiteId),
				trackingIssueWarningsDisabled
					? Promise.resolve(null)
					: getRecentBlockedTrackingIssue(input.websiteId, {
							allowedOrigins: websiteSettings?.allowedOrigins ?? [],
							ignoredOrigins: websiteSettings?.ignoredTrackingOrigins ?? [],
							websiteDomain: website?.domain ?? null,
						}),
			]);
			const trackingIssue = blockedIssueRow
				? buildTrackingIssue(
						blockedIssueRow,
						website?.domain ?? null,
						eventsStatus.recentEvents
					)
				: null;

			return {
				tracking_setup: eventsStatus.hasEvents,
				integration_type: eventsStatus.hasEvents ? "manual" : null,
				has_events: eventsStatus.hasEvents,
				recent_events: eventsStatus.recentEvents,
				status_message: buildStatusMessage(eventsStatus, trackingIssue),
				tracking_issue: trackingIssue,
			};
		}),

	updateSettings: trackedProcedure
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

			if (input.settings === undefined) {
				return website;
			}

			const nextSettings = mergeWebsiteSecuritySettings(
				website.settings,
				input.settings
			);

			let updatedWebsite: Website;
			try {
				updatedWebsite = await websiteService.updateById(input.id, {
					settings: nextSettings,
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
