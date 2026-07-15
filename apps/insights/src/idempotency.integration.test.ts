import "@databuddy/test/env";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { isNotNull, shutdownPostgres, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightRunEffects,
	insightRunItems,
	insightRuns,
} from "@databuddy/db/schema";
import {
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
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
import { eq } from "drizzle-orm";
import { randomUUIDv7 } from "bun";
import type { DetectedSignal } from "./detection";
import { prepareInvestigation } from "./investigation";
import {
	appendInsightObservation,
	findRunObservation,
	loadLatestSignalObservations,
} from "./observations";
import {
	drainInsightRunEffects,
	loadPreparedInsightRun,
	prepareInsightRun,
} from "./effects";
import {
	finalizeCompletedPreparedItem,
	recoverStaleInsightRuns,
	syncRunStatus,
} from "./recovery";

const runIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb;
const describeIntegration = runIntegration ? describe : describe.skip;

async function waitForDatabaseLock(table: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const result = await db().execute(sql<{ waiting: number }>`
			select count(*)::int as waiting
			from pg_stat_activity
			where datname = current_database()
				and pid <> pg_backend_pid()
				and wait_event_type = 'Lock'
				and query like ${`%${table}%`}
		`);
		if ((result.rows[0]?.waiting ?? 0) > 0) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`Timed out waiting for a database lock on ${table}`);
}

describeIntegration("insights idempotency integration", () => {
	beforeEach(async () => {
		await truncatePostgres();
	});

	afterAll(async () => {
		await truncatePostgres();
		await shutdownPostgres();
		await closePostgres();
	});

	it("upserts generated insights by organization dedupe key", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const dedupeKey = `integration:${randomUUIDv7()}`;

		await db().insert(insightRuns).values([
			{
				id: firstRunId,
				organizationId: org.id,
				reason: "manual",
				status: "succeeded",
			},
			{
				id: secondRunId,
				organizationId: org.id,
				reason: "manual",
				status: "succeeded",
			},
		]);

		await db().insert(analyticsInsights).values(
			insightRow({
				id: randomUUIDv7(),
				runId: firstRunId,
				organizationId: org.id,
				websiteId: website.id,
				dedupeKey,
				title: "Original checkout signal",
			})
		);

		await db()
			.insert(analyticsInsights)
			.values(
				insightRow({
					id: randomUUIDv7(),
					runId: secondRunId,
					organizationId: org.id,
					websiteId: website.id,
					dedupeKey,
					title: "Updated checkout signal",
				})
			)
			.onConflictDoUpdate({
				target: [analyticsInsights.organizationId, analyticsInsights.dedupeKey],
				targetWhere: isNotNull(analyticsInsights.dedupeKey),
				set: {
					runId: secondRunId,
					title: sql`excluded.title`,
				},
			});

		const rows = await db()
			.select({
				id: analyticsInsights.id,
				runId: analyticsInsights.runId,
				title: analyticsInsights.title,
			})
			.from(analyticsInsights)
			.where(eq(analyticsInsights.organizationId, org.id));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			runId: secondRunId,
			title: "Updated checkout signal",
		});
	});

	it("keeps one outcome per run and reads memory as of the requested clock", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const thirdRunId = randomUUIDv7();
		await db().insert(insightRuns).values([
			{ id: firstRunId, organizationId: org.id, status: "succeeded" },
			{ id: secondRunId, organizationId: org.id, status: "succeeded" },
			{ id: thirdRunId, organizationId: org.id, status: "succeeded" },
		]);

		const detected: DetectedSignal = {
			baseline: 20,
			current: 5,
			deltaPercent: -75,
			detectedAt: "2026-01-01",
			direction: "down",
			label: "Signup",
			method: "wow",
			metric: "goal:signup",
			severity: "critical",
		};
		const investigation = prepareInvestigation(detected, {
			lookbackDays: 7,
			websiteId: website.id,
		});
		const secondaryInvestigation = prepareInvestigation(
			{
				...detected,
				deltaPercent: -50,
				label: "Purchase",
				metric: "goal:purchase",
			},
			{ lookbackDays: 7, websiteId: website.id }
		);
		const firstAsOf = new Date("2026-01-01T12:00:00.000Z");
		const secondaryAsOf = new Date("2026-01-03T12:00:00.000Z");
		const secondAsOf = new Date("2026-01-10T12:00:00.000Z");
		const base = {
			evidence: investigation.evidence,
			insightId: null,
			organizationId: org.id,
			signal: investigation.signal,
			websiteId: website.id,
		};

		await appendInsightObservation({
			...base,
			asOf: firstAsOf,
			decision: { disposition: "monitor" },
			runId: firstRunId,
		});
		await appendInsightObservation({
			...base,
			asOf: firstAsOf,
			decision: { disposition: "not_a_problem" },
			runId: firstRunId,
		});
		await appendInsightObservation({
			...base,
			asOf: secondAsOf,
			decision: { disposition: "not_a_problem" },
			runId: secondRunId,
		});
		await appendInsightObservation({
			...base,
			asOf: secondaryAsOf,
			decision: { disposition: "monitor" },
			runId: thirdRunId,
			signal: secondaryInvestigation.signal,
		});

		const rows = await db()
			.select({ disposition: insightObservations.disposition })
			.from(insightObservations)
			.where(eq(insightObservations.websiteId, website.id));
		const replay = await findRunObservation({
			organizationId: org.id,
			runId: firstRunId,
			websiteId: website.id,
		});
		const historical = await loadLatestSignalObservations({
			asOf: new Date("2026-01-05T12:00:00.000Z"),
			organizationId: org.id,
			signalKeys: [
				investigation.signal.signalKey,
				secondaryInvestigation.signal.signalKey,
				investigation.signal.signalKey,
			],
			websiteId: website.id,
		});
		const latest = await loadLatestSignalObservations({
			asOf: new Date("2026-01-11T12:00:00.000Z"),
			organizationId: org.id,
			signalKeys: [
				investigation.signal.signalKey,
				secondaryInvestigation.signal.signalKey,
			],
			websiteId: website.id,
		});

		expect(rows).toHaveLength(3);
		expect(replay?.disposition).toBe("monitor");
		expect(historical.size).toBe(2);
		expect(
			historical.get(investigation.signal.signalKey)?.recheckAt.toISOString()
		).toBe("2026-01-08T12:00:00.000Z");
		expect(
			historical.get(investigation.signal.signalKey)?.decision.disposition
		).toBe("monitor");
		expect(historical.get(investigation.signal.signalKey)?.asOf).toEqual(
			firstAsOf
		);
		expect(
			historical.get(investigation.signal.signalKey)?.evidence
		).toEqual(investigation.evidence);
		expect(
			historical.get(secondaryInvestigation.signal.signalKey)?.asOf
		).toEqual(secondaryAsOf);
		expect(latest.size).toBe(2);
		expect(latest.get(investigation.signal.signalKey)?.asOf).toEqual(secondAsOf);
		expect(
			latest.get(investigation.signal.signalKey)?.decision.disposition
		).toBe("not_a_problem");

		await db().delete(insightRuns).where(eq(insightRuns.id, firstRunId));
		const [preserved] = await db()
			.select({ runId: insightObservations.runId })
			.from(insightObservations)
			.where(eq(insightObservations.asOf, firstAsOf));
		expect(preserved?.runId).toBeNull();
	});

	it("prepares effects once and retries only unfinished provider calls", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const identity = {
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
		};
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		const slackPayload = (channelId: string) => ({
			blocks: [
				{
					type: "section",
					text: { type: "mrkdwn", text: "A bounded finding" },
				},
			],
			channelId,
			organizationId: org.id,
			text: "A bounded finding",
			websiteId: website.id,
		});
		const effects = [
			{
				effectKey: "channel-a",
				payload: slackPayload("channel-a"),
			},
			{
				effectKey: "channel-b",
				payload: slackPayload("channel-b"),
			},
		];
		expect(() =>
			prepareInsightRun({
				...identity,
				effects: [
					{
						effectKey: "wrong-tenant",
						payload: {
							...slackPayload("wrong-tenant"),
							organizationId: "another-organization",
						},
					},
				],
				result: { insightIds: [], resultCount: 0, status: "succeeded" },
			})
		).toThrow("identity does not match");

		await prepareInsightRun({
			...identity,
			effects,
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});
		await prepareInsightRun({
			...identity,
			effects,
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});

		const initial = await db()
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(initial).toHaveLength(2);
		const calls: Array<{ id: string; key: string }> = [];
		let failChannelB = true;
		const handlers = {
			slack: async (payload: { channelId: string }, id: string) => {
				calls.push({ id, key: payload.channelId });
				if (payload.channelId === "channel-b" && failChannelB) {
					throw new Error("temporary Slack failure");
				}
				return `ts:${payload.channelId}`;
			},
		};

		await expect(
			drainInsightRunEffects(identity, false, handlers)
		).rejects.toThrow("temporary Slack failure");
		const afterFirst = await db()
			.select({
				effectKey: insightRunEffects.effectKey,
				status: insightRunEffects.status,
			})
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(afterFirst).toEqual(
			expect.arrayContaining([
				{ effectKey: "channel-a", status: "succeeded" },
				{ effectKey: "channel-b", status: "pending" },
			])
		);
		const firstChannelBId = calls.find((call) => call.key === "channel-b")?.id;
		const firstChannelAId = calls.find((call) => call.key === "channel-a")?.id;
		failChannelB = false;
		calls.length = 0;
		await drainInsightRunEffects(identity, false, handlers);
		expect(calls).toEqual([{ id: firstChannelBId, key: "channel-b" }]);
		const prepared = await loadPreparedInsightRun(identity);
		expect(prepared).toMatchObject({
			insightIds: [],
			resultCount: 0,
			status: "succeeded",
		});

		const [channelA] = await db()
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.effectKey, "channel-a"));
		await db()
			.update(insightRunEffects)
			.set({ completedAt: null, status: "pending" })
			.where(eq(insightRunEffects.id, channelA.id));
		let concurrentCalls = 0;
		let releaseSuccess: (() => void) | undefined;
		let successStarted: (() => void) | undefined;
		const providerStarted = new Promise<void>((resolve) => {
			successStarted = resolve;
		});
		const failureRecorded = new Promise<void>((resolve) => {
			releaseSuccess = resolve;
		});
		const concurrentHandler = async () => {
			concurrentCalls += 1;
			if (concurrentCalls === 1) {
				successStarted?.();
				await failureRecorded;
				return "ts:channel-a";
			}
			throw new Error("concurrent final failure");
		};
		const successfulDrain = drainInsightRunEffects(identity, true, {
			slack: concurrentHandler,
		});
		await providerStarted;
		await expect(
			drainInsightRunEffects(identity, true, { slack: concurrentHandler })
		).rejects.toThrow("concurrent final failure");
		const [afterFinalFailure] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(afterFinalFailure.status).toBe("failed");
		releaseSuccess?.();
		await successfulDrain;
		const [afterConcurrentDrain] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(concurrentCalls).toBe(2);
		expect(afterConcurrentDrain.status).toBe("succeeded");

		await db()
			.update(insightRunEffects)
			.set({ completedAt: null, status: "pending" })
			.where(eq(insightRunEffects.id, channelA.id));
		const finalCalls: string[] = [];
		await expect(
			drainInsightRunEffects(identity, true, {
				slack: async (_payload, id) => {
					finalCalls.push(id);
					throw new Error("permanent Slack failure");
				},
			})
		).rejects.toThrow("permanent Slack failure");
		const [failed] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(finalCalls).toEqual([channelA.id]);
		expect(firstChannelAId).toBe(channelA.id);
		expect(failed.status).toBe("failed");
		let replayCalls = 0;
		await expect(
			drainInsightRunEffects(identity, false, {
				slack: async () => {
					replayCalls += 1;
					return "ts:unexpected-replay";
				},
			})
		).rejects.toThrow("failed external effect");
		expect(replayCalls).toBe(0);
	});

	it("retries a known-success checkpoint without calling the provider again", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const identity = {
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
		};
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			...identity,
			effects: [
				{
					effectKey: "checkpoint-retry",
					payload: {
						blocks: [],
						channelId: "channel-checkpoint",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});

		await db().execute(sql.raw(`
			CREATE SEQUENCE insight_effect_checkpoint_test_seq START WITH 1;
			CREATE FUNCTION fail_first_insight_effect_checkpoint()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded'
					AND OLD.status <> 'succeeded'
					AND nextval('insight_effect_checkpoint_test_seq') = 1
				THEN
					RAISE EXCEPTION 'transient success checkpoint failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_first_insight_effect_checkpoint_trigger
			BEFORE UPDATE OF status ON insight_run_effects
			FOR EACH ROW
			EXECUTE FUNCTION fail_first_insight_effect_checkpoint();
		`));

		let providerCalls = 0;
		try {
			await drainInsightRunEffects(identity, true, {
				slack: async () => {
					providerCalls += 1;
					return "ts:checkpoint-retry";
				},
			});
		} finally {
			await db().execute(sql.raw(`
				DROP TRIGGER IF EXISTS fail_first_insight_effect_checkpoint_trigger
				ON insight_run_effects;
				DROP FUNCTION IF EXISTS fail_first_insight_effect_checkpoint();
				DROP SEQUENCE IF EXISTS insight_effect_checkpoint_test_seq;
			`));
		}

		const [effect] = await db()
			.select({
				externalId: insightRunEffects.externalId,
				status: insightRunEffects.status,
			})
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(providerCalls).toBe(1);
		expect(effect).toEqual({
			externalId: "ts:checkpoint-retry",
			status: "succeeded",
		});
	});

	it("keeps a final-attempt success when run synchronization fails", async () => {
		const { processInsightsJob } = await import("./jobs");
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			attempts: 2,
			id: itemId,
			queueJobId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId,
			runId,
			websiteId: website.id,
			effects: [],
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});

		await db().execute(sql.raw(`
			CREATE SEQUENCE insight_item_checkpoint_test_seq START WITH 1;
			CREATE FUNCTION fail_first_insight_item_checkpoint()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded'
					AND OLD.status <> 'succeeded'
					AND nextval('insight_item_checkpoint_test_seq') = 1
				THEN
					RAISE EXCEPTION 'transient item success checkpoint failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_first_insight_item_checkpoint_trigger
			BEFORE UPDATE OF status ON insight_run_items
			FOR EACH ROW
			EXECUTE FUNCTION fail_first_insight_item_checkpoint();

			CREATE FUNCTION fail_insight_run_sync()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded' THEN
					RAISE EXCEPTION 'forced run synchronization failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_insight_run_sync_trigger
			BEFORE UPDATE OF status ON insight_runs
			FOR EACH ROW
			EXECUTE FUNCTION fail_insight_run_sync();
		`));

		const data: InsightsGenerateWebsiteJobData = {
			itemId,
			organizationId: org.id,
			reason: "manual",
			runId,
			websiteId: website.id,
		};
		try {
			await expect(
				processInsightsJob({
					attemptsMade: 2,
					data,
					id: queueJobId,
					name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
					opts: { attempts: 3 },
				})
			).rejects.toThrow('Failed query: update "insight_runs"');
		} finally {
			await db().execute(sql.raw(`
				DROP TRIGGER IF EXISTS fail_first_insight_item_checkpoint_trigger
				ON insight_run_items;
				DROP FUNCTION IF EXISTS fail_first_insight_item_checkpoint();
				DROP SEQUENCE IF EXISTS insight_item_checkpoint_test_seq;
				DROP TRIGGER IF EXISTS fail_insight_run_sync_trigger
				ON insight_runs;
				DROP FUNCTION IF EXISTS fail_insight_run_sync();
			`));
		}

		const [item] = await db()
			.select({
				attempts: insightRunItems.attempts,
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(item).toMatchObject({
			attempts: 3,
			errorMessage: null,
			status: "succeeded",
		});
		expect(item.finishedAt).toBeInstanceOf(Date);
	});

	it("rejects a crossed queue item before changing either tenant", async () => {
		const { processInsightsJob } = await import("./jobs");
		const firstOrg = await insertOrganization();
		const secondOrg = await insertOrganization();
		const firstWebsite = await insertWebsite({ organizationId: firstOrg.id });
		const secondWebsite = await insertWebsite({ organizationId: secondOrg.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const firstItemId = randomUUIDv7();
		const secondItemId = randomUUIDv7();
		const firstJobId = `job-${firstItemId}`;
		const secondJobId = `job-${secondItemId}`;
		await db().insert(insightRuns).values([
			{
				id: firstRunId,
				organizationId: firstOrg.id,
				status: "queued",
				totalItems: 1,
			},
			{
				id: secondRunId,
				organizationId: secondOrg.id,
				status: "queued",
				totalItems: 1,
			},
		]);
		await db().insert(insightRunItems).values([
			{
				id: firstItemId,
				queueJobId: firstJobId,
				runId: firstRunId,
				organizationId: firstOrg.id,
				websiteId: firstWebsite.id,
			},
			{
				id: secondItemId,
				queueJobId: secondJobId,
				runId: secondRunId,
				organizationId: secondOrg.id,
				websiteId: secondWebsite.id,
			},
		]);
		const runState = () =>
			db()
				.select({
					id: insightRuns.id,
					organizationId: insightRuns.organizationId,
					startedAt: insightRuns.startedAt,
					status: insightRuns.status,
					updatedAt: insightRuns.updatedAt,
				})
				.from(insightRuns)
				.orderBy(insightRuns.id);
		const itemState = () =>
			db()
				.select({
					attempts: insightRunItems.attempts,
					id: insightRunItems.id,
					organizationId: insightRunItems.organizationId,
					queueJobId: insightRunItems.queueJobId,
					runId: insightRunItems.runId,
					startedAt: insightRunItems.startedAt,
					status: insightRunItems.status,
					updatedAt: insightRunItems.updatedAt,
					websiteId: insightRunItems.websiteId,
				})
				.from(insightRunItems)
				.orderBy(insightRunItems.id);
		const [runsBefore, itemsBefore] = await Promise.all([
			runState(),
			itemState(),
		]);

		await expect(
			processInsightsJob({
				attemptsMade: 0,
				data: {
					itemId: firstItemId,
					organizationId: secondOrg.id,
					reason: "manual",
					runId: secondRunId,
					websiteId: secondWebsite.id,
				},
				id: secondJobId,
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				opts: { attempts: 3 },
			})
		).rejects.toThrow("identity does not match");

		const [runsAfter, itemsAfter] = await Promise.all([
			runState(),
			itemState(),
		]);
		expect(runsAfter).toEqual(runsBefore);
		expect(itemsAfter).toEqual(itemsBefore);
	});

	it("does not let a duplicate worker claim an already-running item", async () => {
		const { processInsightsJob } = await import("./jobs");
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "queued",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			organizationId: org.id,
			queueJobId,
			runId,
			status: "running",
			websiteId: website.id,
		});

		await expect(
			processInsightsJob({
				attemptsMade: 1,
				data: {
					itemId,
					organizationId: org.id,
					reason: "manual",
					runId,
					websiteId: website.id,
				},
				id: queueJobId,
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				opts: { attempts: 3 },
			})
		).rejects.toThrow("already running");

		const [run] = await db()
			.select({ status: insightRuns.status })
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));
		const [item] = await db()
			.select({
				attempts: insightRunItems.attempts,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(run.status).toBe("queued");
		expect(item).toEqual({ attempts: 0, status: "running" });
	});

	it("recovers a prepared item after its final worker dies before item success", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
			effects: [],
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});

		expect(await finalizeCompletedPreparedItem(itemId)).toBe(true);
		const [item] = await db()
			.select({ status: insightRunItems.status })
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(item.status).toBe("succeeded");
	});

	it("rescues a stale failed item after all prepared effects succeeded", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const pendingWebsite = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const pendingItemId = randomUUIDv7();
		const now = new Date();
		const staleAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "failed",
			totalItems: 2,
			failedItems: 1,
			errorMessage: "stale run failure",
			finishedAt: staleAt,
			updatedAt: staleAt,
		});
		await db().insert(insightRunItems).values([
			{
				id: itemId,
				runId,
				organizationId: org.id,
				websiteId: website.id,
				status: "running",
			},
			{
				id: pendingItemId,
				runId,
				organizationId: org.id,
				websiteId: pendingWebsite.id,
				status: "running",
				updatedAt: now,
			},
		]);
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
			effects: [
				{
					effectKey: "completed-channel",
					payload: {
						blocks: [],
						channelId: "completed-channel",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});
		await db()
			.update(insightRunEffects)
			.set({ completedAt: staleAt, status: "succeeded" })
			.where(eq(insightRunEffects.runItemId, itemId));
		await db()
			.update(insightRunItems)
			.set({
				errorMessage: "late worker failure",
				finishedAt: staleAt,
				status: "failed",
				updatedAt: staleAt,
			})
			.where(eq(insightRunItems.id, itemId));

		const result = await recoverStaleInsightRuns(now);
		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				errorMessage: insightRuns.errorMessage,
				failedItems: insightRuns.failedItems,
				finishedAt: insightRuns.finishedAt,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(result).toMatchObject({
			keptItems: 1,
			scannedItems: 1,
			syncedRuns: 1,
		});
		expect(item).toEqual({
			errorMessage: null,
			finishedAt: now,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			errorMessage: null,
			failedItems: 0,
			finishedAt: null,
			status: "running",
		});
	});

	it("clears stale failed run fields when item state resolves to success", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const staleAt = new Date("2025-01-01T00:00:00.000Z");
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "failed",
			totalItems: 1,
			failedItems: 1,
			errorMessage: "stale run failure",
			finishedAt: staleAt,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "succeeded",
		});

		const summary = await syncRunStatus(runId);
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				errorMessage: insightRuns.errorMessage,
				failedItems: insightRuns.failedItems,
				finishedAt: insightRuns.finishedAt,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(summary).toMatchObject({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run).toMatchObject({
			completedItems: 1,
			errorMessage: null,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run.finishedAt).toBeInstanceOf(Date);
		expect(run.finishedAt).not.toEqual(staleAt);
	});

	it("keeps a settled run's original finish time when status is unchanged", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const finishedAt = new Date("2025-01-01T00:00:00.000Z");
		await db().insert(insightRuns).values({
			completedItems: 1,
			finishedAt,
			id: runId,
			organizationId: org.id,
			status: "succeeded",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			finishedAt,
			id: randomUUIDv7(),
			organizationId: org.id,
			runId,
			status: "succeeded",
			websiteId: website.id,
		});

		await syncRunStatus(runId);

		const [run] = await db()
			.select({ finishedAt: insightRuns.finishedAt })
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));
		expect(run.finishedAt).toEqual(finishedAt);
	});

	it("locks the run before deriving status from its items", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});

		let releaseLock: (() => void) | undefined;
		let reportLock: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			reportLock = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const terminalAt = new Date();
		const terminalWriter = db().transaction(async (tx) => {
			await tx
				.select({ id: insightRuns.id })
				.from(insightRuns)
				.where(eq(insightRuns.id, runId))
				.for("update");
			reportLock?.();
			await release;
			await tx
				.update(insightRunItems)
				.set({
					errorMessage: null,
					finishedAt: terminalAt,
					status: "succeeded",
					updatedAt: terminalAt,
				})
				.where(eq(insightRunItems.id, itemId));
			await tx
				.update(insightRuns)
				.set({
					completedItems: 1,
					errorMessage: null,
					failedItems: 0,
					finishedAt: terminalAt,
					status: "succeeded",
					updatedAt: terminalAt,
				})
				.where(eq(insightRuns.id, runId));
		});
		await locked;

		const staleSync = syncRunStatus(runId);
		await waitForDatabaseLock("insight_runs");
		releaseLock?.();
		const [, summary] = await Promise.all([terminalWriter, staleSync]);
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				failedItems: insightRuns.failedItems,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(summary).toMatchObject({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
	});

	it("does not fail a stale item completed by a concurrent worker", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const pendingWebsite = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const pendingItemId = randomUUIDv7();
		const now = new Date();
		const staleAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 2,
			updatedAt: now,
		});
		await db().insert(insightRunItems).values([
			{
				id: itemId,
				runId,
				organizationId: org.id,
				websiteId: website.id,
				status: "running",
				updatedAt: staleAt,
			},
			{
				id: pendingItemId,
				runId,
				organizationId: org.id,
				websiteId: pendingWebsite.id,
				status: "running",
				updatedAt: now,
			},
		]);

		let releaseLock: (() => void) | undefined;
		let reportLock: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			reportLock = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const completedAt = new Date(now.getTime() + 1000);
		const worker = db().transaction(async (tx) => {
			await tx
				.select({ id: insightRunItems.id })
				.from(insightRunItems)
				.where(eq(insightRunItems.id, itemId))
				.for("update");
			reportLock?.();
			await release;
			await tx
				.update(insightRunItems)
				.set({
					errorMessage: null,
					finishedAt: completedAt,
					status: "succeeded",
					updatedAt: completedAt,
				})
				.where(eq(insightRunItems.id, itemId));
		});
		await locked;

		const recovery = recoverStaleInsightRuns(now);
		await waitForDatabaseLock("insight_run_items");
		releaseLock?.();
		const [, result] = await Promise.all([worker, recovery]);
		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				failedItems: insightRuns.failedItems,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(result).toMatchObject({
			keptItems: 1,
			scannedItems: 1,
		});
		expect(item).toEqual({
			errorMessage: null,
			finishedAt: completedAt,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			failedItems: 0,
			status: "running",
		});
	});

	it("still fails a final item when its prepared effect genuinely fails", async () => {
		const { processInsightsJob } = await import("./jobs");
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			attempts: 2,
			id: itemId,
			queueJobId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId,
			runId,
			websiteId: website.id,
			effects: [
				{
					effectKey: "missing-channel",
					payload: {
						blocks: [],
						channelId: "missing-channel",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { insightIds: [], resultCount: 0, status: "succeeded" },
		});

		const data: InsightsGenerateWebsiteJobData = {
			itemId,
			organizationId: org.id,
			reason: "manual",
			runId,
			websiteId: website.id,
		};
		await expect(
			processInsightsJob({
				attemptsMade: 2,
				data,
				id: queueJobId,
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				opts: { attempts: 3 },
			})
		).rejects.toThrow("Slack channel binding is missing");

		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [effect] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		const [run] = await db()
			.select({ status: insightRuns.status })
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));
		expect(item).toEqual({
			errorMessage: "Slack channel binding is missing",
			status: "failed",
		});
		expect(effect.status).toBe("failed");
		expect(run.status).toBe("failed");
	});
});

function insightRow(input: {
	dedupeKey: string;
	id: string;
	organizationId: string;
	runId: string;
	title: string;
	websiteId: string;
}): typeof analyticsInsights.$inferInsert {
	return {
		id: input.id,
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		runId: input.runId,
		dedupeKey: input.dedupeKey,
		title: input.title,
		description: "A test insight description.",
		suggestion: "Inspect the affected flow.",
		severity: "warning",
		sentiment: "negative",
		type: "conversion_leak",
		priority: 8,
		changePercent: -12,
		subjectKey: "checkout",
		sources: ["web"],
		confidence: 0.82,
		impactSummary: "Checkout needs review.",
		metrics: [{ label: "Errors", current: 12, previous: 6, format: "number" }],
		timezone: "UTC",
		currentPeriodFrom: "2026-01-01",
		currentPeriodTo: "2026-01-08",
		previousPeriodFrom: "2025-12-25",
		previousPeriodTo: "2026-01-01",
	};
}
