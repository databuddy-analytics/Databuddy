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
import { chQuery } from "@databuddy/db/clickhouse";
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
	type InsightRunItem,
	type InsightRunStatus,
	websites,
} from "@databuddy/db/schema";
import {
	getInsightsQueue,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	insightsWebsiteJobId,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { setAuditOrganization } from "../lib/audit";
import { logger } from "../lib/logger";
import { auditedProcedure, type Context, protectedProcedure } from "../orpc";
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
const firstReviewScopeSchema = z.object({
	organizationId: z.string().nullish(),
	websiteId: z.string().min(1),
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

const FIRST_REVIEW_BASELINE_DAYS = 14;
const firstReviewItemStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"failed",
	"skipped",
]);
const firstReviewRunStateSchema = z.enum([
	"running",
	"reviewed",
	"no_findings",
	"deferred",
	"needs_credits",
	"failed",
]);
const firstReviewStateSchema = z.enum([
	"needs_tracking",
	"collecting_baseline",
	"ready",
	"running",
	"waiting_for_organization_run",
	"no_findings",
	"deferred",
	"needs_credits",
	"needs_attention",
	"reviewed",
]);
const firstReviewStatusStateSchema = z.enum([
	"not_started",
	"running",
	"waiting_for_organization_run",
	"reviewed",
	"no_findings",
	"deferred",
	"needs_credits",
	"needs_attention",
]);
const firstReviewActivitySchema = z.object({
	activeDays: z.number().int().nonnegative(),
	pageviews: z.number().int().nonnegative(),
	sessions: z.number().int().nonnegative(),
});
const firstReviewRunSchema = z.object({
	id: z.string(),
	insightCount: z.number().int().nonnegative(),
	state: firstReviewRunStateSchema,
});
const firstReviewReadinessOutputSchema = z.object({
	activity: firstReviewActivitySchema,
	baselineReadyAt: z.string().datetime().nullable(),
	canRun: z.boolean(),
	latestRun: firstReviewRunSchema.nullable(),
	state: firstReviewStateSchema,
	websiteId: z.string(),
});
const firstReviewStatusOutputSchema = z.object({
	activeOrganizationRunId: z.string().nullable(),
	canRun: z.boolean(),
	latestRun: firstReviewRunSchema.nullable(),
	state: firstReviewStatusStateSchema,
	websiteId: z.string(),
});
const frozenFirstReviewPlanSchema = z
	.object({
		candidates: z.array(z.unknown()),
		emptyStatus: z.enum(["deferred", "no_signals"]).optional(),
	})
	.passthrough();

type FirstReviewState = z.infer<typeof firstReviewStateSchema>;
type FirstReviewStatusState = z.infer<typeof firstReviewStatusStateSchema>;
type FirstReviewRunState = z.infer<typeof firstReviewRunStateSchema>;

interface FirstReviewActivity {
	activeDays: number;
	firstScreenViewAt: Date | null;
	pageviews: number;
	sessions: number;
}

interface FirstReviewRun {
	id: string;
	insightCount: number;
	state: FirstReviewRunState;
}

export interface FirstReviewReadinessInput {
	activeOrganizationRunId: string | null;
	activeWebsiteRunId: string | null;
	activity: FirstReviewActivity;
	canRun: boolean;
	latestRun: FirstReviewRun | null;
	now?: Date;
}

export interface FirstReviewStatusInput {
	activeOrganizationRunId: string | null;
	activeWebsiteRunId: string | null;
	canRun: boolean;
	latestRun: FirstReviewRun | null;
}

export interface FirstReviewStoredRunInput {
	candidatePlan: unknown;
	status: z.infer<typeof firstReviewItemStatusSchema>;
}

function baselineReadyAt(firstScreenViewAt: Date | null): Date | null {
	if (!firstScreenViewAt) {
		return null;
	}
	const readyAt = new Date(firstScreenViewAt);
	readyAt.setUTCDate(readyAt.getUTCDate() + FIRST_REVIEW_BASELINE_DAYS);
	return readyAt;
}

export function classifyFirstReviewRun(
	input: FirstReviewStoredRunInput
): FirstReviewRunState {
	if (input.status === "queued" || input.status === "running") {
		return "running";
	}
	if (input.status === "succeeded") {
		return "reviewed";
	}
	if (input.status === "failed") {
		return "failed";
	}

	const plan = frozenFirstReviewPlanSchema.safeParse(input.candidatePlan);
	if (plan.success && plan.data.emptyStatus === "deferred") {
		return "deferred";
	}
	if (plan.success && plan.data.emptyStatus === "no_signals") {
		return "no_findings";
	}
	if (plan.success && plan.data.candidates.length > 0) {
		return "needs_credits";
	}

	// Legacy skipped runs lack a frozen plan. They did not produce a review, so
	// keep them distinct from a completed no-finding review.
	return "deferred";
}

function firstReviewTerminalState(
	state: FirstReviewRunState
): Exclude<
	FirstReviewStatusState,
	"not_started" | "waiting_for_organization_run"
> {
	return state === "failed" ? "needs_attention" : state;
}

function firstReviewRunOutput(
	latestRun: FirstReviewRun | null
): z.infer<typeof firstReviewRunSchema> | null {
	return latestRun
		? {
				id: latestRun.id,
				insightCount: latestRun.insightCount,
				state: latestRun.state,
			}
		: null;
}

function firstReviewState(input: FirstReviewReadinessInput): FirstReviewState {
	if (input.activeWebsiteRunId) {
		return "running";
	}
	if (input.latestRun) {
		return firstReviewTerminalState(input.latestRun.state);
	}
	if (!input.activity.firstScreenViewAt || input.activity.pageviews === 0) {
		return "needs_tracking";
	}
	if (input.activeOrganizationRunId) {
		return "waiting_for_organization_run";
	}
	const readyAt = baselineReadyAt(input.activity.firstScreenViewAt);
	return readyAt && readyAt <= (input.now ?? new Date())
		? "ready"
		: "collecting_baseline";
}

export function firstReviewReadiness(
	input: FirstReviewReadinessInput
): Omit<z.infer<typeof firstReviewReadinessOutputSchema>, "websiteId"> {
	const readyAt = baselineReadyAt(input.activity.firstScreenViewAt);
	return {
		activity: {
			activeDays: input.activity.activeDays,
			pageviews: input.activity.pageviews,
			sessions: input.activity.sessions,
		},
		baselineReadyAt: readyAt?.toISOString() ?? null,
		canRun: input.canRun,
		latestRun: firstReviewRunOutput(input.latestRun),
		state: firstReviewState(input),
	};
}

export function firstReviewStatus(
	input: FirstReviewStatusInput
): Omit<z.infer<typeof firstReviewStatusOutputSchema>, "websiteId"> {
	return {
		activeOrganizationRunId: input.activeOrganizationRunId,
		canRun: input.canRun,
		latestRun: firstReviewRunOutput(input.latestRun),
		state: input.activeWebsiteRunId
			? "running"
			: input.latestRun
				? firstReviewTerminalState(input.latestRun.state)
				: input.activeOrganizationRunId
					? "waiting_for_organization_run"
					: "not_started",
	};
}

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
	setAuditOrganization(context, organizationId);
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

interface FirstReviewActivityRow {
	activeDays: number;
	firstScreenViewUnix: number;
	pageviews: number;
	sessions: number;
}

function nonNegativeInteger(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

async function loadFirstReviewActivity(
	websiteId: string
): Promise<FirstReviewActivity> {
	const [row] = await chQuery<FirstReviewActivityRow>(
		`WITH toStartOfDay(now()) - INTERVAL {baselineDays:UInt32} DAY AS recentFrom
		SELECT
			countIf(time >= recentFrom) AS pageviews,
			uniqExactIf(session_id, session_id != '' AND time >= recentFrom) AS sessions,
			uniqExactIf(toDate(time), time >= recentFrom) AS activeDays,
			toUnixTimestamp(min(time)) AS firstScreenViewUnix
		FROM analytics.events
		PREWHERE client_id = {websiteId:String}
			AND time >= recentFrom - INTERVAL {baselineDays:UInt32} DAY
		WHERE event_name = 'screen_view'`,
		{ baselineDays: FIRST_REVIEW_BASELINE_DAYS, websiteId }
	);
	const firstScreenViewUnix = nonNegativeInteger(row?.firstScreenViewUnix);
	return {
		activeDays: nonNegativeInteger(row?.activeDays),
		firstScreenViewAt:
			nonNegativeInteger(row?.pageviews) > 0 && firstScreenViewUnix > 0
				? new Date(firstScreenViewUnix * 1000)
				: null,
		pageviews: nonNegativeInteger(row?.pageviews),
		sessions: nonNegativeInteger(row?.sessions),
	};
}

async function loadFirstReviewRun(
	organizationId: string,
	websiteId: string
): Promise<FirstReviewRun | null> {
	const [row] = await db
		.select({
			candidatePlan: insightRunItems.candidatePlan,
			id: insightRuns.id,
			resultCount: insightRunItems.resultCount,
			status: insightRunItems.status,
		})
		.from(insightRunItems)
		.innerJoin(insightRuns, eq(insightRunItems.runId, insightRuns.id))
		.where(
			and(
				eq(insightRunItems.organizationId, organizationId),
				eq(insightRunItems.websiteId, websiteId)
			)
		)
		.orderBy(desc(insightRuns.createdAt), desc(insightRunItems.createdAt))
		.limit(1);
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		insightCount: row.resultCount,
		state: classifyFirstReviewRun({
			candidatePlan: row.candidatePlan,
			status: firstReviewItemStatusSchema.parse(row.status),
		}),
	};
}

async function resolveFirstReviewWebsite(
	context: Context,
	input: z.infer<typeof firstReviewScopeSchema>
): Promise<string> {
	const organizationId = await resolveOrganization(context, input, "read");
	await withWorkspace(context, {
		organizationId,
		permissions: ["read"],
		websiteId: input.websiteId,
	});
	return organizationId;
}

function isAccessDenied(error: unknown): boolean {
	return (
		error instanceof ORPCError &&
		(error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
	);
}
function canTriggerInsightGeneration(
	context: Context,
	organizationId: string
): Promise<boolean> {
	return withWorkspace(context, {
		organizationId,
		permissions: ["update"],
		resource: "organization",
	})
		.then(() => true)
		.catch((error) => {
			if (isAccessDenied(error)) {
				return false;
			}
			throw error;
		});
}

interface InsightRunReference {
	id: string;
	totalItems: number;
}

async function findActiveInsightRun(
	organizationId: string
): Promise<InsightRunReference | null> {
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
async function findActiveFirstReviewRun(
	organizationId: string,
	websiteId: string
): Promise<{ id: string; reviewsWebsite: boolean } | null> {
	const [active] = await db
		.select({
			id: insightRuns.id,
			websiteItemId: insightRunItems.id,
		})
		.from(insightRuns)
		.leftJoin(
			insightRunItems,
			and(
				eq(insightRunItems.runId, insightRuns.id),
				eq(insightRunItems.websiteId, websiteId),
				inArray(insightRunItems.status, INSIGHT_RUN_ACTIVE_STATUSES)
			)
		)
		.where(
			and(
				eq(insightRuns.organizationId, organizationId),
				inArray(insightRuns.status, INSIGHT_RUN_ACTIVE_STATUSES)
			)
		)
		.orderBy(desc(insightRuns.createdAt))
		.limit(1);

	return active
		? { id: active.id, reviewsWebsite: active.websiteItemId !== null }
		: null;
}

function reusedInsightRun(
	active: InsightRunReference
): QueueInsightGenerationRunResult {
	return {
		queuedItems: active.totalItems,
		reusedRun: true,
		runId: active.id,
		status: "queued",
	};
}

export interface InsightRunStatusSummary {
	completedItems: number;
	failedItems: number;
	queuedItems: number;
	runningItems: number;
	settled: boolean;
	skippedItems: number;
	status: InsightRunStatus;
	totalItems: number;
}

export function summarizeInsightRunItemErrors(
	items: Pick<InsightRunItem, "errorMessage" | "status">[]
): string | null {
	const counts = new Map<string, number>();
	for (const item of items) {
		if (item.status === "failed" && item.errorMessage) {
			counts.set(item.errorMessage, (counts.get(item.errorMessage) ?? 0) + 1);
		}
	}

	let topMessage: string | null = null;
	let topCount = 0;
	for (const [message, count] of counts) {
		if (count > topCount) {
			topMessage = message;
			topCount = count;
		}
	}
	if (!topMessage) {
		return null;
	}

	const otherTypes = counts.size - 1;
	const suffix = otherTypes > 0 ? ` (+${otherTypes} other error types)` : "";
	return `${topCount} item${topCount === 1 ? "" : "s"}: ${topMessage}${suffix}`;
}

export function syncInsightRunStatus(
	runId: string
): Promise<InsightRunStatusSummary> {
	return withTransaction(async (tx) => {
		await tx
			.select({ id: insightRuns.id })
			.from(insightRuns)
			.where(eq(insightRuns.id, runId))
			.limit(1)
			.for("update");
		const items = await tx
			.select({
				errorMessage: insightRunItems.errorMessage,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.runId, runId));

		const completedItems = items.filter(
			(item) => item.status === "succeeded"
		).length;
		const failedItems = items.filter((item) => item.status === "failed").length;
		const queuedItems = items.filter((item) => item.status === "queued").length;
		const runningItems = items.filter(
			(item) => item.status === "running"
		).length;
		const skippedItems = items.filter(
			(item) => item.status === "skipped"
		).length;
		const settled =
			completedItems + failedItems + skippedItems === items.length;

		let status: InsightRunStatus =
			queuedItems === items.length ? "queued" : "running";
		if (items.length === 0) {
			status = "skipped";
		} else if (settled) {
			if (completedItems > 0 && failedItems === 0) {
				status = "succeeded";
			} else if (completedItems > 0) {
				status = "partially_succeeded";
			} else if (skippedItems === items.length) {
				status = "skipped";
			} else {
				status = "failed";
			}
		}

		const now = new Date();
		await tx
			.update(insightRuns)
			.set({
				completedItems,
				errorMessage:
					settled && failedItems > 0
						? summarizeInsightRunItemErrors(items)
						: null,
				failedItems,
				finishedAt: settled ? now : null,
				skippedItems,
				status,
				totalItems: items.length,
				updatedAt: now,
			})
			.where(eq(insightRuns.id, runId));

		return {
			completedItems,
			failedItems,
			queuedItems,
			runningItems,
			settled,
			skippedItems,
			status,
			totalItems: items.length,
		};
	});
}

interface InsightQueueItem {
	itemId: string;
	jobId: string;
	websiteId: string;
}

interface AppendedInsightRun extends InsightRunReference {
	queueItems: InsightQueueItem[];
}

function createInsightQueueItems(
	runId: string,
	targetWebsites: Array<{ id: string }>
): InsightQueueItem[] {
	return targetWebsites.map((website) => ({
		itemId: randomUUIDv7(),
		jobId: insightsWebsiteJobId(runId, website.id),
		websiteId: website.id,
	}));
}

async function enqueueInsightRunItems(params: {
	organizationId: string;
	queueItems: InsightQueueItem[];
	reason: z.infer<typeof queueReasonSchema>;
	requestedByUserId: string | null;
	runId: string;
}): Promise<void> {
	const queue = getInsightsQueue();
	await queue.addBulk(
		params.queueItems.map((item) => ({
			name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
			data: {
				itemId: item.itemId,
				organizationId: params.organizationId,
				reason: params.reason,
				requestedByUserId: params.requestedByUserId,
				runId: params.runId,
				websiteId: item.websiteId,
			},
			opts: { jobId: item.jobId },
		}))
	);
}

async function failQueueItems(runId: string, itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) {
		return;
	}
	const now = new Date();
	await db
		.update(insightRunItems)
		.set({
			errorMessage: QUEUE_INSIGHT_GENERATION_ERROR,
			finishedAt: now,
			status: "failed",
			updatedAt: now,
		})
		.where(
			and(
				eq(insightRunItems.runId, runId),
				inArray(insightRunItems.id, itemIds),
				eq(insightRunItems.status, "queued")
			)
		);
	await syncInsightRunStatus(runId);
}

function appendManualRunItems(params: {
	organizationId: string;
	reason: z.infer<typeof queueReasonSchema>;
	requestedByUserId: string | null;
	targetWebsites: Array<{ id: string }>;
}): Promise<AppendedInsightRun | null> {
	return withTransaction(async (tx) => {
		const [active] = await tx
			.select({
				id: insightRuns.id,
				totalItems: insightRuns.totalItems,
			})
			.from(insightRuns)
			.where(
				and(
					eq(insightRuns.organizationId, params.organizationId),
					inArray(insightRuns.status, INSIGHT_RUN_ACTIVE_STATUSES)
				)
			)
			.orderBy(desc(insightRuns.createdAt))
			.limit(1)
			.for("update");
		if (!active) {
			return null;
		}

		const items = createInsightQueueItems(active.id, params.targetWebsites);
		const inserted =
			items.length === 0
				? []
				: await tx
						.insert(insightRunItems)
						.values(
							items.map((item) => ({
								id: item.itemId,
								runId: active.id,
								organizationId: params.organizationId,
								reason: params.reason,
								requestedByUserId: params.requestedByUserId,
								websiteId: item.websiteId,
								queueJobId: item.jobId,
							}))
						)
						.onConflictDoNothing({
							target: [insightRunItems.runId, insightRunItems.websiteId],
						})
						.returning({ id: insightRunItems.id });
		const insertedIds = new Set(inserted.map((item) => item.id));
		const queueItems = items.filter((item) => insertedIds.has(item.itemId));
		if (queueItems.length > 0) {
			await tx
				.update(insightRuns)
				.set({
					totalItems: sql`${insightRuns.totalItems} + ${queueItems.length}`,
				})
				.where(eq(insightRuns.id, active.id));
		}

		return {
			id: active.id,
			queueItems,
			totalItems: active.totalItems + queueItems.length,
		};
	});
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

	if (reason !== "manual" && !runConfig.enabled) {
		return { queuedItems: 0, status: "disabled" };
	}

	const targetWebsites = await listTargetWebsites(
		input.organizationId,
		input.websiteIds
	);
	const requestedByUserId = input.requestedByUserId ?? null;

	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (reason === "manual") {
			const active = await appendManualRunItems({
				organizationId: input.organizationId,
				reason,
				requestedByUserId,
				targetWebsites,
			});
			if (active) {
				if (active.queueItems.length > 0) {
					try {
						await enqueueInsightRunItems({
							organizationId: input.organizationId,
							queueItems: active.queueItems,
							reason,
							requestedByUserId,
							runId: active.id,
						});
					} catch (error) {
						logger.error(
							{ error, organizationId: input.organizationId, runId: active.id },
							"Failed to queue appended insight generation"
						);
						await failQueueItems(
							active.id,
							active.queueItems.map((item) => item.itemId)
						);
						throw rpcError.internal("Failed to queue insight generation");
					}
				}
				return reusedInsightRun(active);
			}
		} else {
			const active = await findActiveInsightRun(input.organizationId);
			if (active) {
				return reusedInsightRun(active);
			}
		}

		const runId = randomUUIDv7();
		const queueItems = createInsightQueueItems(runId, targetWebsites);
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
				...(queueItems.length === 0 ? { finishedAt: new Date() } : {}),
			},
			queueItems.map((item) => ({
				id: item.itemId,
				runId,
				organizationId: input.organizationId,
				reason,
				requestedByUserId,
				websiteId: item.websiteId,
				queueJobId: item.jobId,
			}))
		);
		if (concurrentRun) {
			if (reason === "manual") {
				continue;
			}
			return reusedInsightRun(concurrentRun);
		}

		if (queueItems.length === 0) {
			return { queuedItems: 0, runId, status: "skipped" };
		}

		try {
			await enqueueInsightRunItems({
				organizationId: input.organizationId,
				queueItems,
				reason,
				requestedByUserId,
				runId,
			});
		} catch (error) {
			logger.error(
				{ error, organizationId: input.organizationId, runId },
				"Failed to queue insight generation"
			);
			await failQueueItems(
				runId,
				queueItems.map((item) => item.itemId)
			);
			throw rpcError.internal("Failed to queue insight generation");
		}

		return {
			queuedItems: queueItems.length,
			runId,
			status: "queued",
		};
	}

	throw rpcError.internal("Failed to join the active insight generation run");
}

export const insightGenerationRouter = {
	getFirstReviewReadiness: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/getFirstReviewReadiness",
			summary: "Get first-review readiness for a website",
			tags: ["Insights"],
		})
		.input(firstReviewScopeSchema)
		.output(firstReviewReadinessOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveFirstReviewWebsite(context, input);
			const [activity, canRun, latestRun, activeRun] = await Promise.all([
				loadFirstReviewActivity(input.websiteId),
				canTriggerInsightGeneration(context, organizationId),
				loadFirstReviewRun(organizationId, input.websiteId),
				findActiveFirstReviewRun(organizationId, input.websiteId),
			]);
			return {
				websiteId: input.websiteId,
				...firstReviewReadiness({
					activeOrganizationRunId: activeRun?.id ?? null,
					activeWebsiteRunId: activeRun?.reviewsWebsite ? activeRun.id : null,
					activity,
					canRun,
					latestRun,
				}),
			};
		}),

	getFirstReviewStatus: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/generation/getFirstReviewStatus",
			summary: "Get first-review run status for a website",
			tags: ["Insights"],
		})
		.input(firstReviewScopeSchema)
		.output(firstReviewStatusOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = await resolveFirstReviewWebsite(context, input);
			const [canRun, latestRun, activeRun] = await Promise.all([
				canTriggerInsightGeneration(context, organizationId),
				loadFirstReviewRun(organizationId, input.websiteId),
				findActiveFirstReviewRun(organizationId, input.websiteId),
			]);
			return {
				websiteId: input.websiteId,
				...firstReviewStatus({
					activeOrganizationRunId: activeRun?.id ?? null,
					activeWebsiteRunId: activeRun?.reviewsWebsite ? activeRun.id : null,
					canRun,
					latestRun,
				}),
			};
		}),

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

	upsertConfig: auditedProcedure
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

	addSlackDelivery: auditedProcedure
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

	removeSlackDelivery: auditedProcedure
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

	triggerRun: auditedProcedure
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
					analyzedWebsiteCount: z.number(),
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
					analyzedWebsiteCount: sql<number>`count(distinct ${
						insightObservations.websiteId
					})::integer`,
					insightCount: sql<number>`count(*) filter (where ${
						insightObservations.outcome
					}->>'publish' = 'true')::integer`,
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
				analyzedWebsiteCount: count?.analyzedWebsiteCount ?? 0,
				insightCount: count?.insightCount ?? 0,
			};
		}),
};
