import "@databuddy/test/env";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
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
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	truncatePostgres,
} from "@databuddy/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUIDv7 } from "bun";
import { dispatchDueInsightRuns } from "./scheduler";

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

	it("dispatches an org config only to websites without website overrides", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const included = await insertWebsite({
			organizationId: org.id,
			domain: "included.example.com",
		});
		const overridden = await insertWebsite({
			organizationId: org.id,
			domain: "overridden.example.com",
		});
		const now = new Date();

		await db().insert(insightGenerationConfigs).values([
			{
				id: randomUUIDv7(),
				organizationId: org.id,
				websiteId: null,
				enabled: true,
				frequency: "daily",
				nextRunAt: new Date(now.getTime() - 1000),
			},
			{
				id: randomUUIDv7(),
				organizationId: org.id,
				websiteId: overridden.id,
				enabled: true,
				frequency: "weekly",
				nextRunAt: new Date(now.getTime() + 86_400_000),
			},
		]);

		const result = await dispatchDueInsightRuns(now);

		expect(result).toMatchObject({
			scannedConfigs: 1,
			claimedConfigs: 1,
			dispatchedRuns: 1,
			queuedItems: 1,
			skippedConfigs: 0,
		});

		const runs = await runsForOrg(org.id);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			organizationId: org.id,
			reason: "scheduled",
			status: "queued",
			totalItems: 1,
		});

		const items = await itemsForRun(runs[0].id);
		expect(items.map((item) => item.websiteId)).toEqual([included.id]);

		const jobs = await queueJobsForOrg(org.id);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.name).toBe("insights-generate-website");
		expect(jobs[0]?.data.websiteId).toBe(included.id);
		expect(jobs[0]?.data.runId).toBe(runs[0].id);

		const [config] = await db()
			.select({
				lastRunAt: insightGenerationConfigs.lastRunAt,
				nextRunAt: insightGenerationConfigs.nextRunAt,
			})
			.from(insightGenerationConfigs)
			.where(
				and(
					eq(insightGenerationConfigs.organizationId, org.id),
					isNull(insightGenerationConfigs.websiteId)
				)
			)
			.limit(1);

		expect(config?.lastRunAt?.getTime()).toBe(now.getTime());
		expect(config?.nextRunAt && config.nextRunAt.getTime() > now.getTime()).toBe(
			true
		);
	});

	it("dispatches due website configs independently", async () => {
		const org = await insertOrganization();
		organizationIds.add(org.id);
		const website = await insertWebsite({
			organizationId: org.id,
			domain: "website-scope.example.com",
		});
		const now = new Date();

		await db().insert(insightGenerationConfigs).values({
			id: randomUUIDv7(),
			organizationId: org.id,
			websiteId: website.id,
			enabled: true,
			frequency: "hourly",
			nextRunAt: new Date(now.getTime() - 1000),
		});

		const result = await dispatchDueInsightRuns(now);

		expect(result).toMatchObject({
			scannedConfigs: 1,
			claimedConfigs: 1,
			dispatchedRuns: 1,
			queuedItems: 1,
			skippedConfigs: 0,
		});

		const runs = await runsForOrg(org.id);
		const items = await itemsForRun(runs[0].id);
		const jobs = await queueJobsForOrg(org.id);

		expect(items.map((item) => item.websiteId)).toEqual([website.id]);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.data.websiteId).toBe(website.id);
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
