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
	INSIGHT_RUN_ACTIVE_STATUSES,
	INSIGHT_RUN_ACTIVE_UNIQUE_INDEX,
	insightGenerationConfigs,
	insightObservations,
	insightRunItems,
	insightRuns,
	slackChannelBindings,
	slackIntegrations,
	type InsightGenerationConfig,
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
const queueReasonSchema = z.enum(["manual", "scheduled"]);
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
	enabled: z.boolean().optional(),
	frequency: frequencySchema.optional(),
	timezone: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.refine(isValidTimezone, "Invalid IANA timezone")
		.optional(),
});
const runPatchSchema = configPatchSchema.pick({
	timezone: true,
});
const organizationScopeSchema = z.object({
	organizationId: z.string().nullish(),
	websiteId: z.never().optional(),
});

const configOutputSchema = z.object({
	deliveries: z.array(deliverySchema),
	enabled: z.boolean(),
	frequency: frequencySchema,
	nextRunAt: z.union([z.date(), z.string()]).nullable(),
	timezone: z.string(),
});

const runStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"partially_succeeded",
	"failed",
	"skipped",
]);

const DEFAULT_CONFIG: z.infer<typeof configOutputSchema> = {
	deliveries: [],
	enabled: false,
	frequency: "weekly",
	nextRunAt: null,
	timezone: "UTC",
};

export interface QueueInsightGenerationRunInput
	extends z.infer<typeof runPatchSchema> {
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

function rowToConfig(
	row: InsightGenerationConfig | null
): z.infer<typeof configOutputSchema> {
	if (!row) {
		return { ...DEFAULT_CONFIG };
	}

	return {
		deliveries: row.deliveries,
		enabled: row.enabled,
		frequency: normalizeInsightScheduleFrequency(row.frequency),
		nextRunAt: row.enabled ? row.nextRunAt : null,
		timezone: normalizeInsightTimezone(row.timezone),
	};
}

function applyPatch(
	config: z.infer<typeof configOutputSchema>,
	patch: z.infer<typeof configPatchSchema>
): z.infer<typeof configOutputSchema> {
	const parsed = configPatchSchema.parse(patch);
	return {
		...config,
		enabled: parsed.enabled ?? config.enabled,
		frequency: parsed.frequency ?? config.frequency,
		timezone: parsed.timezone ?? config.timezone,
	};
}

async function resolveOrganization(
	context: Context,
	input: { organizationId?: string | null },
	permission: "read" | "update"
): Promise<string> {
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
	return rowToConfig(row);
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
		const current = rowToConfig(row ?? null);
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
			enabled: next.enabled,
			frequency: next.frequency,
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
	organizationId: string
): Promise<{ id: string; totalItems: number } | null> {
	const [active] = await db
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
			await withTransaction(async (tx) => {
				await tx.insert(insightRuns).values(run);
				if (items.length > 0) {
					await tx.insert(insightRunItems).values(items);
				}
			});
			return null;
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
	const runPatch = runPatchSchema.parse(input);
	const runConfig = applyPatch(baseConfig, runPatch);
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

	const runItems = queueItems.map((item) => ({
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
		await Promise.all([
			db
				.update(insightRuns)
				.set({
					errorMessage: QUEUE_INSIGHT_GENERATION_ERROR,
					failedItems: queueItems.length,
					finishedAt: new Date(),
					status: "failed",
				})
				.where(eq(insightRuns.id, runId)),
			db
				.update(insightRunItems)
				.set({
					errorMessage: QUEUE_INSIGHT_GENERATION_ERROR,
					finishedAt: new Date(),
					status: "failed",
				})
				.where(eq(insightRunItems.runId, runId)),
		]);
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
			return getConfig(organizationId);
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
			const organizationId = await resolveOrganization(
				context,
				input,
				"update"
			);
			return mutateConfig(organizationId, (current) =>
				applyPatch(current, input)
			);
		}),

	addSlackDelivery: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/addSlackDelivery",
			summary: "Send investigations to a Slack channel",
			tags: ["Insights"],
		})
		.input(
			organizationScopeSchema.extend({
				channelId: z.string().min(1).max(120),
				frequency: frequencySchema.optional(),
			})
		)
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(
				context,
				input,
				"update"
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
			if (bindings.length === 0) {
				throw rpcError.badRequest(
					"Connect or use the Databuddy Slack app in this channel first"
				);
			}
			if (bindings.length > 1) {
				throw rpcError.badRequest(
					"Multiple active Slack connections match this channel"
				);
			}
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
				const base = applyPatch(
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
			summary: "Stop sending investigations to a Slack channel",
			tags: ["Insights"],
		})
		.input(
			organizationScopeSchema.extend({
				channelId: z.string().min(1).max(120),
			})
		)
		.output(configOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(
				context,
				input,
				"update"
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
				.extend(runPatchSchema.shape)
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
				organizationId,
				requestedByUserId: context.user?.id ?? null,
				timezone: input.timezone,
				websiteIds: input.websiteIds,
			});
		}),

	getLatestRun: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/getLatestRun",
			summary: "Get the latest insight generation run",
			tags: ["Insights"],
		})
		.input(organizationScopeSchema)
		.output(
			z
				.object({
					analyzedSignalCount: z.number(),
					completedItems: z.number(),
					failedItems: z.number(),
					id: z.string(),
					insightCount: z.number(),
					skippedItems: z.number(),
					status: runStatusSchema,
					totalItems: z.number(),
				})
				.nullable()
		)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveOrganization(context, input, "read");
			const [run] = await db
				.select({
					completedItems: insightRuns.completedItems,
					failedItems: insightRuns.failedItems,
					id: insightRuns.id,
					skippedItems: insightRuns.skippedItems,
					status: insightRuns.status,
					totalItems: insightRuns.totalItems,
				})
				.from(insightRuns)
				.where(eq(insightRuns.organizationId, organizationId))
				.orderBy(desc(insightRuns.createdAt), desc(insightRuns.id))
				.limit(1);
			if (!run) {
				return null;
			}
			const [count] = await db
				.select({
					analyzedSignalCount: sql<number>`count(*)::integer`,
					insightCount: sql<number>`count(*) filter (where ${
						insightObservations.outcome
					}->>'publish' = 'true' or (${
						insightObservations.outcome
					}->>'publish' is null and ${
						insightObservations.insightId
					} is not null))::integer`,
				})
				.from(insightObservations)
				.where(
					and(
						eq(insightObservations.runId, run.id),
						eq(insightObservations.organizationId, organizationId)
					)
				);

			return {
				...run,
				analyzedSignalCount: count?.analyzedSignalCount ?? 0,
				insightCount: count?.insightCount ?? 0,
			};
		}),
};
