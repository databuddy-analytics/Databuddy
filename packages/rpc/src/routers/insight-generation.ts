import {
	and,
	db,
	desc,
	eq,
	inArray,
	isNull,
	isUniqueViolationFor,
	sql,
	withTransaction,
} from "@databuddy/db";
import {
	DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT,
	INSIGHT_RUN_ACTIVE_STATUSES,
	INSIGHT_RUN_ACTIVE_UNIQUE_INDEX,
	insightGenerationConfigs,
	insightRunItems,
	insightRuns,
	slackChannelBindings,
	slackIntegrations,
	type InsightGenerationConfig,
	type InsightGenerationConfigSnapshot,
	websites,
} from "@databuddy/db/schema";
import {
	getInsightsQueue,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	insightsWebsiteJobId,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { type Context, protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import {
	getNextInsightRunAt,
	isValidTimezone,
	normalizeInsightScheduleFrequency,
	normalizeInsightTimezone,
} from "../services/insight-schedule";

const queueStatusSchema = z.enum(["queued", "skipped", "disabled"]);
const frequencySchema = z.enum(["daily", "weekly"]);
const legacyFrequencySchema = z.enum(["hourly", "daily", "weekly", "custom"]);
const generationToolSchema = z.enum([
	"web_metrics",
	"product_metrics",
	"ops_context",
	"business_context",
]);
const depthSchema = z.enum(["light", "standard", "deep"]);
const modelTierSchema = z.enum(["fast", "balanced", "deep"]);
const queueReasonSchema = z.enum(["manual", "scheduled"]);
const reasonSchema = z.enum(["manual", "scheduled", "cooldown_refresh"]);
const deliverySchema = z.object({
	channelId: z.string().min(1).max(120),
	type: z.literal("slack"),
});

const MAX_SLACK_DELIVERIES = 10;
const CONFIG_UNIQUE_INDEX = "insight_generation_configs_org_uidx";
const QUEUE_INSIGHT_GENERATION_ERROR =
	"Failed to queue insight generation. Please try again shortly.";

type ConfigExecutor =
	| typeof db
	| Parameters<Parameters<typeof withTransaction>[0]>[0];

const configPatchSchema = z.object({
	allowedTools: z.array(generationToolSchema).min(1).max(4).optional(),
	cooldownHours: z.number().int().min(1).max(168).optional(),
	cron: z.string().trim().min(1).max(120).nullable().optional(),
	depth: depthSchema.optional(),
	enabled: z.boolean().optional(),
	frequency: legacyFrequencySchema.optional(),
	lookbackDays: z.number().int().min(1).max(90).optional(),
	maxInsightsPerWebsite: z.number().int().min(1).max(10).optional(),
	maxSteps: z.number().int().min(1).max(64).optional(),
	maxToolCalls: z.number().int().min(1).max(64).optional(),
	modelTier: modelTierSchema.optional(),
	timezone: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.refine(isValidTimezone, "Invalid IANA timezone")
		.optional(),
});
const organizationScopeSchema = z.object({
	organizationId: z.string().nullish(),
	websiteId: z.string().nullish(),
});

const configOutputSchema = z.object({
	allowedTools: z.array(generationToolSchema).describe("Deprecated"),
	cooldownHours: z.number().describe("Deprecated"),
	createdAt: z.union([z.date(), z.string()]).nullable(),
	cron: z.string().nullable().describe("Deprecated"),
	deliveries: z.array(deliverySchema),
	depth: depthSchema.describe("Deprecated"),
	enabled: z.boolean(),
	frequency: frequencySchema,
	id: z.string().nullable(),
	lastRunAt: z.union([z.date(), z.string()]).nullable(),
	lookbackDays: z.number().describe("Deprecated"),
	maxInsightsPerWebsite: z.number().describe("Deprecated"),
	maxSteps: z.number().describe("Deprecated"),
	maxToolCalls: z.number().describe("Deprecated"),
	modelTier: modelTierSchema.describe("Deprecated"),
	nextRunAt: z.union([z.date(), z.string()]).nullable(),
	organizationId: z.string(),
	source: z.enum(["default", "organization"]),
	timezone: z.string(),
	updatedAt: z.union([z.date(), z.string()]).nullable(),
	websiteId: z
		.string()
		.nullable()
		.describe("Deprecated read scope; settings inherit from the organization"),
});

const runOutputSchema = z.object({
	completedItems: z.number(),
	createdAt: z.union([z.date(), z.string()]),
	errorMessage: z.string().nullable(),
	failedItems: z.number(),
	finishedAt: z.union([z.date(), z.string()]).nullable(),
	id: z.string(),
	organizationId: z.string(),
	reason: reasonSchema,
	requestedByUserId: z.string().nullable(),
	skippedItems: z.number(),
	startedAt: z.union([z.date(), z.string()]).nullable(),
	status: z.enum([
		"queued",
		"running",
		"succeeded",
		"partially_succeeded",
		"failed",
		"skipped",
	]),
	timezone: z.string(),
	totalItems: z.number(),
	updatedAt: z.union([z.date(), z.string()]),
});

const runItemOutputSchema = z.object({
	attempts: z.number(),
	configSnapshot: z.unknown(),
	createdAt: z.union([z.date(), z.string()]),
	errorMessage: z.string().nullable(),
	finishedAt: z.union([z.date(), z.string()]).nullable(),
	id: z.string(),
	queueJobId: z.string().nullable(),
	resultCount: z.number(),
	runId: z.string(),
	startedAt: z.union([z.date(), z.string()]).nullable(),
	status: z.enum(["queued", "running", "succeeded", "failed", "skipped"]),
	updatedAt: z.union([z.date(), z.string()]),
	websiteId: z.string(),
});

const DEFAULT_CONFIG: Omit<
	z.infer<typeof configOutputSchema>,
	| "createdAt"
	| "id"
	| "lastRunAt"
	| "nextRunAt"
	| "organizationId"
	| "source"
	| "updatedAt"
> = {
	allowedTools: [...DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.allowedTools],
	cooldownHours: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.cooldownHours,
	cron: null,
	deliveries: [],
	depth: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.depth,
	enabled: false,
	frequency: "weekly",
	lookbackDays: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.lookbackDays,
	maxInsightsPerWebsite:
		DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxInsightsPerWebsite,
	maxSteps: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxSteps,
	maxToolCalls: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxToolCalls,
	modelTier: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.modelTier,
	timezone: "UTC",
	websiteId: null,
};

export interface QueueInsightGenerationRunInput
	extends z.infer<typeof configPatchSchema> {
	organizationId: string;
	reason?: z.infer<typeof queueReasonSchema>;
	requestedByUserId?: string | null;
	websiteIds?: string[];
}

export interface QueueInsightGenerationRunResult {
	queuedItems: number;
	reusedRun?: boolean;
	runId?: string;
	status: z.infer<typeof queueStatusSchema>;
}

export function assertSingleActiveSlackBinding(bindingCount: number): void {
	if (bindingCount === 0) {
		throw rpcError.badRequest(
			"Connect or use the Databuddy Slack app in this channel first"
		);
	}
	if (bindingCount > 1) {
		throw rpcError.badRequest(
			"Multiple active Slack connections match this channel"
		);
	}
}

function rowToConfig(
	row: InsightGenerationConfig | null,
	fallback: z.infer<typeof configOutputSchema>,
	source: "default" | "organization"
): z.infer<typeof configOutputSchema> {
	if (!row) {
		return { ...fallback, source };
	}

	return {
		allowedTools: [...DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.allowedTools],
		cooldownHours: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.cooldownHours,
		createdAt: row.createdAt,
		cron: null,
		deliveries: row.deliveries,
		depth: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.depth,
		enabled: row.enabled,
		frequency: normalizeInsightScheduleFrequency(row.frequency),
		id: row.id,
		lastRunAt: row.lastRunAt,
		lookbackDays: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.lookbackDays,
		maxInsightsPerWebsite:
			DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxInsightsPerWebsite,
		maxSteps: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxSteps,
		maxToolCalls: DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.maxToolCalls,
		modelTier: row.legacyModelTier,
		nextRunAt: row.enabled ? row.nextRunAt : null,
		organizationId: row.organizationId,
		source,
		timezone: normalizeInsightTimezone(row.timezone),
		updatedAt: row.updatedAt,
		websiteId: null,
	};
}

function defaultConfig(
	organizationId: string
): z.infer<typeof configOutputSchema> {
	return {
		...DEFAULT_CONFIG,
		createdAt: null,
		id: null,
		lastRunAt: null,
		nextRunAt: null,
		organizationId,
		source: "default",
		updatedAt: null,
	};
}

function compatibilitySnapshot(
	timezone: string
): InsightGenerationConfigSnapshot {
	return {
		...DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT,
		allowedTools: [...DEFAULT_INSIGHT_GENERATION_CONFIG_SNAPSHOT.allowedTools],
		timezone,
	};
}

export function applyInsightGenerationConfigPatch(
	config: z.infer<typeof configOutputSchema>,
	patch: z.infer<typeof configPatchSchema>
): z.infer<typeof configOutputSchema> {
	const parsed = configPatchSchema.parse(patch);
	const frequency =
		parsed.frequency === "daily" || parsed.frequency === "weekly"
			? parsed.frequency
			: config.frequency;
	return {
		...config,
		enabled: parsed.enabled ?? config.enabled,
		frequency,
		timezone: parsed.timezone ?? config.timezone,
	};
}

async function resolveOrganization(
	context: Context,
	input: {
		organizationId?: string | null;
		websiteId?: string | null;
	},
	permission: "read" | "update"
): Promise<string> {
	if (input.websiteId) {
		const workspace = await withWorkspace(context, {
			websiteId: input.websiteId,
			resource: "website",
			permissions: [permission === "read" ? "view_analytics" : "update"],
		});
		if (
			input.organizationId &&
			input.organizationId !== workspace.website.organizationId
		) {
			throw rpcError.badRequest("Website does not belong to organization");
		}
		await withWorkspace(context, {
			organizationId: workspace.website.organizationId,
			resource: "organization",
			permissions: [permission],
			allowCrossOrg: true,
		});
		return workspace.website.organizationId;
	}

	const organizationId = input.organizationId?.trim() || context.organizationId;
	if (!organizationId) {
		throw rpcError.badRequest("Organization ID is required");
	}
	await withWorkspace(context, {
		organizationId,
		resource: "organization",
		permissions: [permission],
	});
	return organizationId;
}

async function resolveOrganizationForMutation(
	context: Context,
	input: z.infer<typeof organizationScopeSchema>
): Promise<string> {
	const organizationId = await resolveOrganization(context, input, "update");
	if (input.websiteId) {
		throw rpcError.badRequest(
			"Website-specific insight settings are retired. Remove websiteId to update the organization settings."
		);
	}
	return organizationId;
}

async function findConfig(
	organizationId: string,
	executor: ConfigExecutor = db
): Promise<InsightGenerationConfig | null> {
	const rows = await executor
		.select()
		.from(insightGenerationConfigs)
		.where(eq(insightGenerationConfigs.organizationId, organizationId))
		.limit(1);
	return rows[0] ?? null;
}

async function getConfig(
	organizationId: string,
	executor: ConfigExecutor = db
): Promise<z.infer<typeof configOutputSchema>> {
	const row = await findConfig(organizationId, executor);
	return rowToConfig(
		row,
		defaultConfig(organizationId),
		row ? "organization" : "default"
	);
}

function runConfigMutation(
	organizationId: string,
	apply: (
		current: z.infer<typeof configOutputSchema>
	) => z.infer<typeof configOutputSchema>
): Promise<z.infer<typeof configOutputSchema>> {
	return withTransaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, organizationId))
			.limit(1)
			.for("update");
		const current = rowToConfig(
			row ?? null,
			defaultConfig(organizationId),
			row ? "organization" : "default"
		);
		const next = apply(current);
		const now = new Date();
		const scheduleChanged =
			!row ||
			row.enabled !== next.enabled ||
			row.frequency !== next.frequency ||
			row.timezone !== next.timezone;
		let nextRunAt = row?.nextRunAt ?? null;
		if (!next.enabled) {
			nextRunAt = null;
		} else if (scheduleChanged || !nextRunAt) {
			nextRunAt = getNextInsightRunAt(next, now);
		}
		const values = {
			deliveries: next.deliveries,
			dispatchDueAt: scheduleChanged ? null : (row?.dispatchDueAt ?? null),
			enabled: next.enabled,
			frequency: next.frequency,
			legacyModelTier: next.modelTier,
			nextRunAt,
			timezone: next.timezone,
		};

		if (row) {
			await tx
				.update(insightGenerationConfigs)
				.set({ ...values, updatedAt: now })
				.where(eq(insightGenerationConfigs.id, row.id));
		} else {
			await tx.insert(insightGenerationConfigs).values({
				id: randomUUIDv7(),
				organizationId,
				...values,
			});
		}

		return getConfig(organizationId, tx);
	});
}

export async function mutateConfig(
	organizationId: string,
	apply: (
		current: z.infer<typeof configOutputSchema>
	) => z.infer<typeof configOutputSchema>
): Promise<z.infer<typeof configOutputSchema>> {
	let result: z.infer<typeof configOutputSchema>;
	try {
		result = await runConfigMutation(organizationId, apply);
	} catch (error) {
		const isFirstInsertRace = isUniqueViolationFor(error, CONFIG_UNIQUE_INDEX);
		if (!isFirstInsertRace) {
			throw error;
		}
		result = await runConfigMutation(organizationId, apply);
	}
	await invalidateInsightsCachesForOrganization(organizationId).catch(() => {
		// Cache invalidation is best-effort after the config write commits.
	});
	return result;
}

async function listTargetWebsites(
	organizationId: string,
	websiteIds: string[] | undefined
): Promise<Array<{ id: string }>> {
	if (websiteIds?.length === 0) {
		throw rpcError.badRequest("Select at least one website");
	}
	const conditions = [
		eq(websites.organizationId, organizationId),
		isNull(websites.deletedAt),
	];
	if (websiteIds?.length) {
		conditions.push(inArray(websites.id, websiteIds));
	}

	const rows = await db
		.select({ id: websites.id })
		.from(websites)
		.where(and(...conditions));

	if (websiteIds?.length && rows.length !== new Set(websiteIds).size) {
		throw rpcError.badRequest(
			"One or more websites are not in this organization"
		);
	}

	return rows;
}

async function findActiveInsightRun(
	organizationId: string,
	executor: ConfigExecutor = db
): Promise<{ id: string; totalItems: number } | null> {
	const [active] = await executor
		.select({ id: insightRuns.id, totalItems: insightRuns.totalItems })
		.from(insightRuns)
		.where(
			and(
				eq(insightRuns.organizationId, organizationId),
				inArray(insightRuns.status, INSIGHT_RUN_ACTIVE_STATUSES)
			)
		)
		.orderBy(desc(insightRuns.createdAt))
		.limit(1);

	return active ?? null;
}

function reusedInsightRun(active: {
	id: string;
	totalItems: number;
}): QueueInsightGenerationRunResult {
	return {
		queuedItems: active.totalItems,
		reusedRun: true,
		runId: active.id,
		status: "queued",
	};
}

async function insertInsightRunOrFindActive(
	organizationId: string,
	run: typeof insightRuns.$inferInsert,
	items: (typeof insightRunItems.$inferInsert)[]
): Promise<{ id: string; totalItems: number } | null> {
	let conflict: unknown;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			return await withTransaction(async (tx) => {
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${`insight-run:${organizationId}`}, 0))`
				);
				const active = await findActiveInsightRun(organizationId, tx);
				if (active) {
					return active;
				}

				await tx.insert(insightRuns).values(run);
				if (items.length > 0) {
					await tx.insert(insightRunItems).values(items);
				}
				return null;
			});
		} catch (error) {
			if (!isUniqueViolationFor(error, INSIGHT_RUN_ACTIVE_UNIQUE_INDEX)) {
				throw error;
			}
			conflict = error;
			const active = await findActiveInsightRun(organizationId);
			if (active) {
				return active;
			}
		}
	}
	throw conflict;
}

export async function queueInsightGenerationRun(
	input: QueueInsightGenerationRunInput
): Promise<QueueInsightGenerationRunResult> {
	if (input.websiteIds?.length === 0) {
		throw rpcError.badRequest("Select at least one website");
	}
	const baseConfig = await getConfig(input.organizationId);
	const runConfig = applyInsightGenerationConfigPatch(baseConfig, input);
	const reason = input.reason ?? "manual";

	const active = await findActiveInsightRun(input.organizationId);
	if (active) {
		return reusedInsightRun(active);
	}

	if (reason !== "manual" && !runConfig.enabled) {
		return { queuedItems: 0, status: "disabled" };
	}

	const targetWebsites = await listTargetWebsites(
		input.organizationId,
		input.websiteIds
	);
	const runId = randomUUIDv7();
	const queueItems = targetWebsites.map((website) => {
		const itemId = randomUUIDv7();
		return {
			itemId,
			jobId: insightsWebsiteJobId(runId, website.id),
			websiteId: website.id,
		};
	});
	const requestedByUserId = input.requestedByUserId ?? null;
	const now = new Date();
	const configSnapshot = compatibilitySnapshot(runConfig.timezone);

	const runItems = queueItems.map((item) => ({
		configSnapshot,
		id: item.itemId,
		runId,
		organizationId: input.organizationId,
		websiteId: item.websiteId,
		queueJobId: item.jobId,
	}));
	const concurrentRun = await insertInsightRunOrFindActive(
		input.organizationId,
		{
			id: runId,
			organizationId: input.organizationId,
			requestedByUserId,
			reason,
			status: queueItems.length === 0 ? "skipped" : "queued",
			timezone: runConfig.timezone,
			totalItems: queueItems.length,
			...(queueItems.length === 0 ? { finishedAt: now } : {}),
		},
		runItems
	);
	if (concurrentRun) {
		return reusedInsightRun(concurrentRun);
	}

	if (queueItems.length === 0) {
		return { queuedItems: 0, runId, status: "skipped" };
	}

	try {
		const queue = getInsightsQueue();
		await queue.addBulk(
			queueItems.map((item) => ({
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				data: {
					itemId: item.itemId,
					organizationId: input.organizationId,
					reason,
					requestedByUserId,
					runId,
					websiteId: item.websiteId,
				},
				opts: { jobId: item.jobId },
			}))
		);
	} catch (error) {
		logger.error(
			{ error, organizationId: input.organizationId, runId },
			"Failed to queue insight generation"
		);
		await withTransaction(async (tx) => {
			await tx
				.update(insightRuns)
				.set({
					errorMessage: QUEUE_INSIGHT_GENERATION_ERROR,
					failedItems: queueItems.length,
					finishedAt: new Date(),
					status: "failed",
				})
				.where(eq(insightRuns.id, runId));
			await tx
				.update(insightRunItems)
				.set({
					errorMessage: QUEUE_INSIGHT_GENERATION_ERROR,
					finishedAt: new Date(),
					status: "failed",
				})
				.where(eq(insightRunItems.runId, runId));
		});
		throw rpcError.internal("Failed to queue insight generation");
	}

	return {
		queuedItems: queueItems.length,
		runId,
		status: "queued",
	};
}

export const insightGenerationRouter = {
	getConfig: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/getConfig",
			summary: "Get insight generation config",
			tags: ["Insights"],
		})
		.input(organizationScopeSchema)
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(context, input, "read");
			const config = await getConfig(organizationId);
			return input.websiteId
				? { ...config, websiteId: input.websiteId }
				: config;
		}),

	upsertConfig: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/upsertConfig",
			summary: "Create or update insight generation config",
			tags: ["Insights"],
		})
		.input(organizationScopeSchema.extend(configPatchSchema.shape))
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganizationForMutation(
				context,
				input
			);
			return mutateConfig(organizationId, (current) =>
				applyInsightGenerationConfigPatch(current, input)
			);
		}),

	addSlackDelivery: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/addSlackDelivery",
			summary: "Send findings to a Slack channel",
			tags: ["Insights"],
		})
		.input(
			organizationScopeSchema.extend({
				channelId: z.string().min(1).max(120),
				frequency: legacyFrequencySchema.optional(),
			})
		)
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganizationForMutation(
				context,
				input
			);
			const bindings = await db
				.select({ id: slackChannelBindings.id })
				.from(slackChannelBindings)
				.innerJoin(
					slackIntegrations,
					and(
						eq(slackChannelBindings.integrationId, slackIntegrations.id),
						eq(slackIntegrations.organizationId, organizationId),
						eq(slackIntegrations.status, "active")
					)
				)
				.where(eq(slackChannelBindings.slackChannelId, input.channelId))
				.limit(2);
			assertSingleActiveSlackBinding(bindings.length);
			return mutateConfig(organizationId, (current) => {
				const filtered = current.deliveries.filter(
					(delivery) =>
						!(
							delivery.type === "slack" &&
							delivery.channelId === input.channelId
						)
				);
				if (filtered.length >= MAX_SLACK_DELIVERIES) {
					throw rpcError.badRequest(
						`Cannot route to more than ${MAX_SLACK_DELIVERIES} Slack channels`
					);
				}
				const base = applyInsightGenerationConfigPatch(
					current,
					input.frequency
						? { enabled: true, frequency: input.frequency }
						: { enabled: true }
				);
				return {
					...base,
					deliveries: [
						...filtered,
						{ channelId: input.channelId, type: "slack" },
					],
				};
			});
		}),

	removeSlackDelivery: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/removeSlackDelivery",
			summary: "Stop sending findings to a Slack channel",
			tags: ["Insights"],
		})
		.input(
			organizationScopeSchema.extend({
				channelId: z.string().min(1).max(120),
			})
		)
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganizationForMutation(
				context,
				input
			);
			return mutateConfig(organizationId, (current) => ({
				...current,
				deliveries: current.deliveries.filter(
					(delivery) =>
						!(
							delivery.type === "slack" &&
							delivery.channelId === input.channelId
						)
				),
			}));
		}),

	triggerRun: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/triggerRun",
			summary: "Queue an insight generation run",
			tags: ["Insights"],
		})
		.input(
			z
				.object({
					organizationId: z.string().nullish(),
					websiteIds: z.array(z.string().min(1)).min(1).max(100).optional(),
				})
				.extend(configPatchSchema.shape)
		)
		.output(
			z.object({
				queuedItems: z.number(),
				reusedRun: z.boolean().optional(),
				runId: z.string().optional(),
				status: queueStatusSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(
				context,
				input,
				"update"
			);
			return queueInsightGenerationRun({
				...input,
				organizationId,
				requestedByUserId: context.user?.id ?? null,
			});
		}),

	getRun: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/getRun",
			summary: "Get insight generation run",
			tags: ["Insights"],
		})
		.input(z.object({ runId: z.string() }))
		.output(
			z.object({ items: z.array(runItemOutputSchema), run: runOutputSchema })
		)
		.handler(async ({ context, input }) => {
			const run = await db.query.insightRuns.findFirst({
				where: { id: input.runId },
			});
			if (!run) {
				throw rpcError.notFound("InsightRun", input.runId);
			}

			await withWorkspace(context, {
				organizationId: run.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const items = await db.query.insightRunItems.findMany({
				where: { runId: input.runId },
			});

			return { items, run };
		}),

	listRuns: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/listRuns",
			summary: "List insight generation runs",
			description: "Deprecated compatibility endpoint for run history.",
			tags: ["Insights"],
		})
		.input(
			organizationScopeSchema.extend({
				limit: z.number().int().min(1).max(100).default(20),
			})
		)
		.output(z.object({ runs: z.array(runOutputSchema) }))
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(context, input, "read");
			const runs = await db
				.select()
				.from(insightRuns)
				.where(eq(insightRuns.organizationId, organizationId))
				.orderBy(desc(insightRuns.createdAt))
				.limit(input.limit);
			return { runs };
		}),
};
