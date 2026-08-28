import "@databuddy/test/env";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { db as appDb, shutdownPostgres } from "@databuddy/db";
import {
	insightGenerationConfigs,
	insightRunItems,
	insightRuns,
} from "@databuddy/db/schema";
import {
	closeInsightsQueue,
	getInsightsQueue,
	type InsightsGenerateWebsiteJobData,
} from "@databuddy/redis";
import {
	mutateConfig,
	queueInsightGenerationRun,
	setInvestigationsAccessResolver,
} from "@databuddy/rpc/insight-generation";
import {
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertUser,
	insertWebsite,
	truncatePostgres,
} from "@databuddy/test";
import { asc, eq } from "drizzle-orm";
import { randomUUIDv7 } from "bun";
import {
	claimDueConfig,
	dispatchDueInsightRuns,
	retryConfigSoon,
} from "./scheduler";

const runIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb;
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration("insights scheduler integration", () => {
	const organizationIds = new Set<string>();

	setInvestigationsAccessResolver(async () => true);

	beforeEach(async () => {
		await truncatePostgres();
	});

	afterEach(async () => {
		await cleanupQueueJobs();
		await truncatePostgres();
		organizationIds.clear();
	});

	afterAll(async () => {
		setInvestigationsAccessResolver(null);
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
				nextRunAt: insightGenerationConfigs.nextRunAt,
			})
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id))
			.limit(1);

		expect(config?.nextRunAt && config.nextRunAt.getTime() > now.getTime()).toBe(
			true
		);
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
		const claimedNextRunAt = new Date("2026-01-22T09:00:00.000Z");
		const changedNextRunAt = new Date("2026-01-23T09:00:00.000Z");
		await db().insert(insightGenerationConfigs).values({
			id: configId,
			organizationId: org.id,
			enabled: true,
			nextRunAt: claimedNextRunAt,
		});
		const [claimed] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
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
			.set({ enabled: false, nextRunAt: claimedNextRunAt })
			.where(eq(insightGenerationConfigs.id, configId));
		await retryConfigSoon(claimed, new Date());
		const [disabled] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		expect(disabled).toMatchObject({
			enabled: false,
			nextRunAt: claimedNextRunAt,
		});

		const [sameTimeClaim] = await db()
			.update(insightGenerationConfigs)
			.set({
				enabled: true,
				frequency: "daily",
				nextRunAt: claimedNextRunAt,
			})
			.where(eq(insightGenerationConfigs.id, configId))
			.returning();
		await db()
			.update(insightGenerationConfigs)
			.set({
				frequency: "weekly",
				updatedAt: new Date(sameTimeClaim.updatedAt.getTime() + 1000),
			})
			.where(eq(insightGenerationConfigs.id, configId));

		await retryConfigSoon(sameTimeClaim, new Date());

		const [sameTimeEdited] = await db()
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.id, configId));
		expect(sameTimeEdited).toMatchObject({
			frequency: "weekly",
			nextRunAt: claimedNextRunAt,
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

	it("joins selected websites into one active organization run", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const firstWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "first.example.com",
		});
		const secondWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "second.example.com",
		});
		const results = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				queueInsightGenerationRun({
					organizationId: org.id,
					timezone: " UTC ",
					websiteIds: [
						index % 2 === 0 ? firstWebsite.id : secondWebsite.id,
					],
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
			totalItems: 2,
		});

		const items = await itemsForRun(runs[0].id);
		const jobs = await queueJobsForOrg(org.id);
		const configs = await db()
			.select({ id: insightGenerationConfigs.id })
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, org.id));
		expect(configs).toHaveLength(0);
		expect(items.map((item) => item.websiteId).sort()).toEqual(
			[firstWebsite.id, secondWebsite.id].sort()
		);
		expect(jobs.map((job) => job.data.websiteId).sort()).toEqual(
			[firstWebsite.id, secondWebsite.id].sort()
		);
		expect(jobs[0]?.data.runId).toBe(runs[0].id);
	});

	it("keeps a manual site's request context in scheduled work", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const requester = await insertUser();
		const scheduledWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "scheduled.example.com",
		});
		const manualWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "manual.example.com",
		});
		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			enabled: true,
		});

		await queueInsightGenerationRun({
			organizationId: org.id,
			reason: "scheduled",
			websiteIds: [scheduledWebsite.id],
		});
		const [scheduledRun] = await runsForOrg(org.id);
		const manual = await queueInsightGenerationRun({
			organizationId: org.id,
			requestedByUserId: requester.id,
			websiteIds: [manualWebsite.id],
		});

		expect(manual).toMatchObject({
			reusedRun: true,
			runId: scheduledRun.id,
		});
		const items = await itemsForRun(scheduledRun.id);
		expect(
			items.map((item) => ({
				reason: item.reason,
				requestedByUserId: item.requestedByUserId,
				websiteId: item.websiteId,
			}))
		).toEqual(
			expect.arrayContaining([
				{
					reason: "scheduled",
					requestedByUserId: null,
					websiteId: scheduledWebsite.id,
				},
				{
					reason: "manual",
					requestedByUserId: requester.id,
					websiteId: manualWebsite.id,
				},
			])
		);
	});

	it("settles an active run when appended work cannot be queued", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const completedWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "completed.example.com",
		});
		const failedWebsite = await insertWebsite({
			organizationId: org.id,
			domain: "failed.example.com",
		});
		await queueInsightGenerationRun({
			organizationId: org.id,
			websiteIds: [completedWebsite.id],
		});
		const [run] = await runsForOrg(org.id);
		const [item] = await itemsForRun(run.id);
		await db()
			.update(insightRunItems)
			.set({ finishedAt: new Date(), status: "succeeded" })
			.where(eq(insightRunItems.id, item.id));
		await db()
			.update(insightRuns)
			.set({ completedItems: 1, status: "running" })
			.where(eq(insightRuns.id, run.id));

		const publish = spyOn(getInsightsQueue(), "addBulk").mockRejectedValue(
			new Error("Redis unavailable")
		);
		try {
			await expect(
				queueInsightGenerationRun({
					organizationId: org.id,
					websiteIds: [failedWebsite.id],
				})
			).rejects.toThrow("Failed to queue insight generation");
		} finally {
			publish.mockRestore();
		}

		const [failedRun] = await runsForOrg(org.id);
		expect(failedRun).toMatchObject({
			completedItems: 1,
			failedItems: 1,
			status: "partially_succeeded",
			totalItems: 2,
		});
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
