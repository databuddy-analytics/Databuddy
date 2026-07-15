import "@databuddy/test/env";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as appDb, shutdownPostgres } from "@databuddy/db";
import {
	insightGenerationConfigs,
	insightRollups,
	insightRunItems,
	insightRuns,
} from "@databuddy/db/schema";
import {
	closeInsightsQueue,
	getBullMQWorkerConnectionOptions,
	getInsightsQueue,
	INSIGHTS_QUEUE_ENV_PREFIX,
	INSIGHTS_QUEUE_NAME,
	INSIGHTS_ROLLUP_JOB_NAME,
	insightsRollupJobId,
	type InsightsGenerateWebsiteJobData,
} from "@databuddy/redis";
import {
	mutateConfig,
	queueInsightGenerationRun,
} from "@databuddy/rpc/insight-generation";
import {
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	truncatePostgres,
} from "@databuddy/test";
import { asc, eq } from "drizzle-orm";
import { randomUUIDv7 } from "bun";
import { Worker } from "bullmq";
import { processRollupJob } from "./rollup";
import {
	claimDueConfig,
	dispatchDueInsightRuns,
	retryConfigSoon,
} from "./scheduler";
import {
	getInsightsStaleItemMs,
	recoverStaleInsightRuns,
} from "./recovery";
import { loadPreparedInsightRun, prepareInsightRun } from "./effects";

const runIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb;
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("insights scheduler integration", () => {
	const organizationIds = new Set<string>();

	beforeEach(async () => {
		await truncatePostgres();
	});

	afterEach(async () => {
		await cleanupQueueJobs();
		await truncatePostgres();
		organizationIds.clear();
	});

	afterAll(async () => {
		await cleanupQueueJobs();
		await closeInsightsQueue();
		await shutdownPostgres();
		await closePostgres();
	});

	it("dispatches one organization config to all active websites", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const included = await insertWebsite({
			organizationId: org.id,
			domain: "included.example.com",
		});
		const second = await insertWebsite({
			organizationId: org.id,
			domain: "second.example.com",
		});
		const now = new Date();

		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
			frequency: "daily",
			nextRunAt: new Date(now.getTime() - 1000),
		});

		const result = await dispatchDueInsightRuns(now);

		expect(result).toMatchObject({
			scannedConfigs: 1,
			claimedConfigs: 1,
			dispatchedRuns: 1,
			queuedItems: 2,
			skippedConfigs: 0,
		});

		const runs = await runsForOrg(org.id);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			organizationId: org.id,
			reason: "scheduled",
			status: "queued",
			totalItems: 2,
		});

		const items = await itemsForRun(runs[0].id);
		expect(items.map((item) => item.websiteId).sort()).toEqual(
			[included.id, second.id].sort()
		);
		expect(
			items.every(
				(item) => item.configSnapshot.timezone === runs[0]?.timezone
			)
		).toBe(true);

		const jobs = await queueJobsForOrg(org.id);
		expect(jobs).toHaveLength(2);
		expect(jobs.every((job) => job.name === "insights-generate-website")).toBe(
			true
		);
		expect(jobs.map((job) => job.data.websiteId).sort()).toEqual(
			[included.id, second.id].sort()
		);
		expect(jobs.every((job) => job.data.runId === runs[0].id)).toBe(true);
		const [config] = await db()
			.select({
				lastRunAt: insightGenerationConfigs.lastRunAt,
				nextRunAt: insightGenerationConfigs.nextRunAt,
			})
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id))
			.limit(1);

		expect(config?.lastRunAt?.getTime()).toBe(now.getTime());
		expect(config?.nextRunAt && config.nextRunAt.getTime() > now.getTime()).toBe(
			true
		);
	});

	it("requeues a durable run item when the process dies before BullMQ add", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		await insertWebsite({ organizationId: org.id });
		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
		});
		const queued = await queueInsightGenerationRun({
			organizationId: org.id,
			reason: "scheduled",
		});
		const [item] = await itemsForRun(queued.runId!);
		const job = item?.queueJobId
			? await getInsightsQueue().getJob(item.queueJobId)
			: undefined;
		expect(job).toBeDefined();
		await job?.remove();

		const staleAt = new Date("2026-01-01T00:00:00.000Z");
		await appDb
			.update(insightRunItems)
			.set({ updatedAt: staleAt })
			.where(eq(insightRunItems.id, item!.id));
		const result = await recoverStaleInsightRuns(
			new Date(staleAt.getTime() + getInsightsStaleItemMs() + 1000)
		);

		expect(result.requeuedItems).toBe(1);
		const recovered = await getInsightsQueue().getJob(item!.queueJobId!);
		expect(recovered?.data).toMatchObject({
			itemId: item!.id,
			organizationId: org.id,
			runId: queued.runId,
		});
	});

	it("rotates the job identity after a worker dies before preparing", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const oldJobId = `dead-worker-${itemId}`;
		const staleAt = new Date("2026-01-01T00:00:00.000Z");
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
			updatedAt: staleAt,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			organizationId: org.id,
			queueJobId: oldJobId,
			runId,
			startedAt: staleAt,
			status: "running",
			updatedAt: staleAt,
			websiteId: website.id,
		});

		const result = await recoverStaleInsightRuns(
			new Date(staleAt.getTime() + getInsightsStaleItemMs() + 1000)
		);
		const [item] = await itemsForRun(runId);

		expect(result.requeuedItems).toBe(1);
		expect(item).toMatchObject({ status: "queued" });
		expect(item.queueJobId).not.toBe(oldJobId);
		expect(item.startedAt).toBeNull();
		expect(await getInsightsQueue().getJob(item.queueJobId!)).toBeDefined();
	});

	it("reuses prepared effects while fencing the dead worker", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const oldJobId = `dead-worker-${itemId}`;
		const staleAt = new Date("2026-01-01T00:00:00.000Z");
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
			updatedAt: staleAt,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			organizationId: org.id,
			queueJobId: oldJobId,
			runId,
			startedAt: staleAt,
			status: "running",
			websiteId: website.id,
		});
		const preparedInput = {
			effects: [
				{
					effectKey: "pending-channel",
					payload: {
						blocks: [],
						channelId: "pending-channel",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			itemId,
			organizationId: org.id,
			queueJobId: oldJobId,
			result: { insightIds: [], resultCount: 0, status: "succeeded" as const },
			runId,
			websiteId: website.id,
		};
		await prepareInsightRun(preparedInput);
		await db()
			.update(insightRunItems)
			.set({ updatedAt: staleAt })
			.where(eq(insightRunItems.id, itemId));

		const result = await recoverStaleInsightRuns(
			new Date(staleAt.getTime() + getInsightsStaleItemMs() + 1000)
		);
		const [item] = await itemsForRun(runId);
		const newIdentity = {
			itemId,
			organizationId: org.id,
			queueJobId: item.queueJobId,
			runId,
			websiteId: website.id,
		};

		expect(result.requeuedItems).toBe(1);
		expect(item.queueJobId).not.toBe(oldJobId);
		expect(await loadPreparedInsightRun(newIdentity)).toMatchObject({
			resultCount: 0,
			status: "succeeded",
		});
		await expect(prepareInsightRun(preparedInput)).rejects.toThrow(
			"not found while preparing effects"
		);
	});

	it("dispatches only organizations selected for a canary", async () => {
		const selected = await insertOrganization();
		const heldBack = await insertOrganization();
		organizationIds.add(selected.id);
		organizationIds.add(heldBack.id);
		await insertWebsite({ organizationId: selected.id });
		await insertWebsite({ organizationId: heldBack.id });
		const now = new Date();
		const dueAt = new Date(now.getTime() - 1000);
		await db().insert(insightGenerationConfigs).values([
			{
				id: randomUUIDv7(),
				organizationId: selected.id,
				enabled: true,
				nextRunAt: dueAt,
			},
			{
				id: randomUUIDv7(),
				organizationId: heldBack.id,
				enabled: true,
				nextRunAt: dueAt,
			},
		]);

		const result = await dispatchDueInsightRuns(now, [selected.id]);

		expect(result).toMatchObject({
			scannedConfigs: 1,
			claimedConfigs: 1,
			dispatchedRuns: 1,
		});
		expect(await runsForOrg(selected.id)).toHaveLength(1);
		expect(await runsForOrg(heldBack.id)).toHaveLength(0);
		const [heldBackConfig] = await db()
			.select({ nextRunAt: insightGenerationConfigs.nextRunAt })
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, heldBack.id));
		expect(heldBackConfig?.nextRunAt).toEqual(dueAt);
	});

	it("advances a due config when the organization has no websites", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const now = new Date();

		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
			frequency: "weekly",
			nextRunAt: new Date(now.getTime() - 1000),
			timezone: "UT<C",
		});

		const result = await dispatchDueInsightRuns(now);

		expect(result).toMatchObject({
			scannedConfigs: 1,
			claimedConfigs: 1,
			dispatchedRuns: 0,
			queuedItems: 0,
			skippedConfigs: 1,
		});

		const runs = await runsForOrg(org.id);
		const jobs = await queueJobsForOrg(org.id);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			status: "skipped",
			timezone: "UTC",
			totalItems: 0,
		});
		expect(jobs).toHaveLength(0);
	});

	it("rejects an explicitly empty manual website selection", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		await insertWebsite({
			organizationId: org.id,
			domain: "not-selected.example.com",
		});

		await expect(
			queueInsightGenerationRun({
				organizationId: org.id,
				websiteIds: [],
			})
		).rejects.toThrow("Select at least one website");
		const configs = await db()
			.select({ id: insightGenerationConfigs.id })
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		expect(configs).toHaveLength(0);
		expect(await runsForOrg(org.id)).toHaveLength(0);
		expect(await queueJobsForOrg(org.id)).toHaveLength(0);
	});

	it("serializes config patches without reanchoring unchanged schedules", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);

		await Promise.all([
			mutateConfig(org.id, (current) => ({ ...current, enabled: true })),
			mutateConfig(org.id, (current) => ({
				...current,
				timezone: "Europe/Berlin",
			})),
		]);

		const configs = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		expect(configs).toHaveLength(1);
		expect(configs[0]).toMatchObject({
			enabled: true,
			timezone: "Europe/Berlin",
		});
		const originalNextRunAt = configs[0]?.nextRunAt;
		expect(originalNextRunAt).toBeInstanceOf(Date);

		const deliveryOnly = await mutateConfig(org.id, (current) => ({
			...current,
			deliveries: [{ channelId: "C_TEST", type: "slack" }],
		}));
		expect(deliveryOnly.nextRunAt).toEqual(originalNextRunAt);

		const rescheduled = await mutateConfig(org.id, (current) => ({
			...current,
			timezone: "America/New_York",
		}));
		expect(rescheduled.nextRunAt).not.toEqual(originalNextRunAt);

		const disabled = await mutateConfig(org.id, (current) => ({
			...current,
			enabled: false,
		}));
		expect(disabled.nextRunAt).toBeNull();
	});

	it("does not overwrite a config changed after dispatch claim", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const configId = randomUUIDv7();
		const dueAt = new Date("2026-01-22T09:00:00.000Z");
		const changedNextRunAt = new Date("2026-01-23T09:00:00.000Z");
		await db().insert(insightGenerationConfigs).values({
			id: configId,
			organizationId: org.id,
			enabled: true,
			nextRunAt: dueAt,
		});
		const [dueConfig] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		const claimed = await claimDueConfig(
			dueConfig,
			new Date("2026-01-22T09:01:00.000Z")
		);
		expect(claimed).not.toBeNull();
		if (!claimed) {
			throw new Error("Expected config claim");
		}
		await db()
			.update(insightGenerationConfigs)
			.set({ nextRunAt: changedNextRunAt })
			.where(eq(insightGenerationConfigs.id, configId));

		await retryConfigSoon(claimed, new Date());

		const [config] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		expect(config?.nextRunAt).toEqual(changedNextRunAt);

		await db()
			.update(insightGenerationConfigs)
			.set({ enabled: false, nextRunAt: claimed.nextRunAt })
			.where(eq(insightGenerationConfigs.id, configId));
		await retryConfigSoon(claimed, new Date());
		const [disabled] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		expect(disabled).toMatchObject({
			enabled: false,
			nextRunAt: claimed.nextRunAt,
		});
	});

	it("does not claim a stale config snapshot after an admin edit", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const now = new Date("2026-01-22T09:00:00.000Z");
		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
			frequency: "daily",
			nextRunAt: new Date(now.getTime() - 1000),
		});
		const [stale] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		await db()
			.update(insightGenerationConfigs)
			.set({
				frequency: "weekly",
				updatedAt: new Date(stale.updatedAt.getTime() + 1000),
			})
			.where(eq(insightGenerationConfigs.id, stale.id));

		expect(await claimDueConfig(stale, now)).toBeNull();
		const [current] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, stale.id));
		expect(current.frequency).toBe("weekly");
		expect(current.nextRunAt).toEqual(stale.nextRunAt);
	});

	it("recovers a durable scheduled run after a claim-process crash", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		await insertWebsite({ organizationId: org.id });
		const now = new Date();
		const dueAt = new Date(now.getTime() - 1000);
		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
			nextRunAt: dueAt,
		});
		const queued = await queueInsightGenerationRun({
			organizationId: org.id,
			reason: "scheduled",
		});

		const result = await dispatchDueInsightRuns(now);

		expect(result).toMatchObject({
			claimedConfigs: 1,
			dispatchedRuns: 0,
			skippedConfigs: 1,
		});
		expect(await runsForOrg(org.id)).toHaveLength(1);
		const [config] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		expect(config.lastRunAt).toBeInstanceOf(Date);
		expect(config.nextRunAt && config.nextRunAt > now).toBe(true);
		expect((await runsForOrg(org.id))[0]?.id).toBe(queued.runId);
	});

	it("preserves the original due time across an expired dispatch lease", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		await insertWebsite({ organizationId: org.id });
		const now = new Date();
		const dueAt = new Date(now.getTime() - 1000);
		const configId = randomUUIDv7();
		await db().insert(insightGenerationConfigs).values({
			id: configId,
			organizationId: org.id,
			enabled: true,
			nextRunAt: dueAt,
		});
		const [dueConfig] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		const claimed = await claimDueConfig(dueConfig, now);
		expect(claimed?.dispatchDueAt).toEqual(dueAt);
		if (!claimed?.nextRunAt) {
			throw new Error("Expected a leased config");
		}

		const queued = await queueInsightGenerationRun({
			organizationId: org.id,
			reason: "scheduled",
		});
		await db()
			.update(insightRuns)
			.set({ finishedAt: new Date(), status: "succeeded" })
			.where(eq(insightRuns.id, queued.runId!));

		const result = await dispatchDueInsightRuns(
			new Date(claimed.nextRunAt.getTime() + 1)
		);

		expect(result).toMatchObject({
			claimedConfigs: 1,
			dispatchedRuns: 0,
			skippedConfigs: 1,
		});
		expect(await runsForOrg(org.id)).toHaveLength(1);
		const [config] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		expect(config.dispatchDueAt).toBeNull();
		expect(config.lastRunAt).toBeInstanceOf(Date);
	});

	it("requeues a missing rollup for the latest settled run", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const runId = randomUUIDv7();
		const finishedAt = new Date("2026-01-22T09:00:00.000Z");
		await db().insert(insightRuns).values({
			completedItems: 1,
			finishedAt,
			id: runId,
			organizationId: org.id,
			reason: "scheduled",
			status: "succeeded",
			totalItems: 1,
		});

		const result = await recoverStaleInsightRuns(
			new Date(finishedAt.getTime() + getInsightsStaleItemMs() + 1000)
		);

		expect(result.requeuedRollups).toBe(1);
		const job = await getInsightsQueue().getJob(insightsRollupJobId(runId));
		expect(job?.data).toMatchObject({
			organizationId: org.id,
			runId,
		});
	});

	it("uses run creation order when repairing the latest missing rollup", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const olderRunId = randomUUIDv7();
		const newerRunId = randomUUIDv7();
		const olderCreatedAt = new Date("2026-01-20T09:00:00.000Z");
		const newerCreatedAt = new Date("2026-01-21T09:00:00.000Z");
		await db().insert(insightRuns).values([
			{
				completedItems: 1,
				createdAt: olderCreatedAt,
				finishedAt: new Date("2026-01-23T09:00:00.000Z"),
				id: olderRunId,
				organizationId: org.id,
				reason: "scheduled",
				status: "succeeded",
				totalItems: 1,
			},
			{
				completedItems: 1,
				createdAt: newerCreatedAt,
				finishedAt: new Date("2026-01-22T09:00:00.000Z"),
				id: newerRunId,
				organizationId: org.id,
				reason: "scheduled",
				status: "succeeded",
				totalItems: 1,
			},
		]);
		await db().insert(insightRollups).values(
			(["7d", "30d", "90d"] as const).map((range) => ({
				id: randomUUIDv7(),
				narrative: `older ${range}`,
				organizationId: org.id,
				range,
				runId: olderRunId,
			}))
		);

		const result = await recoverStaleInsightRuns(
			new Date("2026-02-01T00:00:00.000Z")
		);

		expect(result.requeuedRollups).toBe(1);
		expect(
			await getInsightsQueue().getJob(insightsRollupJobId(newerRunId))
		).toBeDefined();
		expect(
			await getInsightsQueue().getJob(insightsRollupJobId(olderRunId))
		).toBeUndefined();
	});

	it("retries a retained failed rollup job", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const runId = randomUUIDv7();
		const finishedAt = new Date();
		await db().insert(insightRuns).values({
			completedItems: 1,
			finishedAt,
			id: runId,
			organizationId: org.id,
			reason: "scheduled",
			status: "succeeded",
			totalItems: 1,
		});

		const jobId = insightsRollupJobId(runId);
		const worker = new Worker(
			INSIGHTS_QUEUE_NAME,
			async (job) => {
				if (job.id === jobId) {
					throw new Error("simulated retained rollup failure");
				}
				return null;
			},
			{
				connection: getBullMQWorkerConnectionOptions({
					envPrefix: INSIGHTS_QUEUE_ENV_PREFIX,
				}),
			}
		);
		worker.on("error", () => undefined);
		await worker.waitUntilReady();
		const failedJob = await getInsightsQueue().add(
			INSIGHTS_ROLLUP_JOB_NAME,
			{
				organizationId: org.id,
				reason: "scheduled",
				runId,
				timezone: "UTC",
			},
			{ attempts: 1, jobId, removeOnFail: false }
		);
		for (let attempt = 0; attempt < 100; attempt += 1) {
			if ((await failedJob.getState()) === "failed") {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		expect(await failedJob.getState()).toBe("failed");
		await worker.close();

		const result = await recoverStaleInsightRuns(
			new Date(finishedAt.getTime() + getInsightsStaleItemMs() + 1000)
		);

		expect(result.requeuedRollups).toBe(1);
		expect(await failedJob.getState()).toBe("waiting");
	});

	it("does not let a delayed older rollup overwrite a newer run", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const olderRunId = randomUUIDv7();
		const newerRunId = randomUUIDv7();
		const olderAt = new Date("2026-01-01T00:00:00.000Z");
		const newerAt = new Date("2026-01-02T00:00:00.000Z");
		await db().insert(insightRuns).values([
			{
				createdAt: olderAt,
				finishedAt: olderAt,
				id: olderRunId,
				organizationId: org.id,
				status: "succeeded",
			},
			{
				createdAt: newerAt,
				finishedAt: newerAt,
				id: newerRunId,
				organizationId: org.id,
				status: "succeeded",
			},
		]);
		await db().insert(insightRollups).values(
			(["7d", "30d", "90d"] as const).map((range) => ({
				id: randomUUIDv7(),
				organizationId: org.id,
				range,
				runId: newerRunId,
				narrative: `newer ${range}`,
			}))
		);

		await processRollupJob({
			organizationId: org.id,
			reason: "scheduled",
			runId: olderRunId,
			timezone: "UTC",
		});

		const rows = await db()
			.select({ narrative: insightRollups.narrative, runId: insightRollups.runId })
			.from(insightRollups)
			.where(eq(insightRollups.organizationId, org.id));
		expect(rows).toHaveLength(3);
		expect(rows.every((row) => row.runId === newerRunId)).toBe(true);
		expect(rows.every((row) => row.narrative.startsWith("newer"))).toBe(true);
	});

	it("coalesces concurrent queue requests into one active organization run", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const website = await insertWebsite({
			organizationId: org.id,
			domain: "concurrent.example.com",
		});
		await insertWebsite({
			organizationId: org.id,
			domain: "not-selected.example.com",
		});
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				queueInsightGenerationRun({
					organizationId: org.id,
					timezone: " UTC ",
					websiteIds: [website.id],
				})
			)
		);

		const runIds = results.map((result) => result.runId);
		expect(new Set(runIds).size).toBe(1);
		expect(results.filter((result) => result.reusedRun).length).toBe(7);
		expect(results.every((result) => result.status === "queued")).toBe(true);

		const runs = await runsForOrg(org.id);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			organizationId: org.id,
			status: "queued",
			totalItems: 1,
		});

		const items = await itemsForRun(runs[0].id);
		const jobs = await queueJobsForOrg(org.id);
		const configs = await db()
			.select({ id: insightGenerationConfigs.id })
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		expect(configs).toHaveLength(0);
		expect(items).toHaveLength(1);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.data.runId).toBe(runs[0].id);
	});

	async function runsForOrg(organizationId: string) {
		return await appDb
			.select()
			.from(insightRuns)
			.where(eq(insightRuns.organizationId, organizationId))
			.orderBy(asc(insightRuns.createdAt));
	}

	async function itemsForRun(runId: string) {
		return await appDb
			.select()
			.from(insightRunItems)
			.where(eq(insightRunItems.runId, runId))
			.orderBy(asc(insightRunItems.websiteId));
	}

	async function queueJobsForOrg(organizationId: string) {
		const jobs = await getInsightsQueue().getJobs(
			["waiting", "delayed", "prioritized", "paused", "completed", "failed"],
			0,
			-1
		);
		return jobs
			.filter((job) => {
				const data = job.data as Partial<InsightsGenerateWebsiteJobData>;
				return data.organizationId === organizationId;
			})
			.sort((a, b) =>
				String(a.data.websiteId ?? "").localeCompare(
					String(b.data.websiteId ?? "")
				)
			);
	}

	async function cleanupQueueJobs(): Promise<void> {
		if (organizationIds.size === 0) {
			return;
		}
		const jobs = await getInsightsQueue().getJobs(
			["waiting", "delayed", "prioritized", "paused", "completed", "failed"],
			0,
			-1
		);
		await Promise.allSettled(
			jobs
				.filter((job) => {
					const data = job.data as Partial<InsightsGenerateWebsiteJobData>;
					return (
						typeof data.organizationId === "string" &&
						organizationIds.has(data.organizationId)
					);
				})
				.map((job) => job.remove())
		);
	}
});
