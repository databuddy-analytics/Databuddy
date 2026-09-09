import { randomUUID } from "node:crypto";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { executeQuery } from "@databuddy/ai/query";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightRuns,
	organization,
	websites,
} from "@databuddy/db/schema";
import { saveOrganizationBusinessProfile } from "@databuddy/services/organization-business-context";
import type { BusinessMeasurementPlan } from "@databuddy/shared/organization-business-context";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { parseInvestigationOutcome } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import {
	discoverWebsiteSignals,
	type InvestigationSources,
	remeasureStoredSignal,
} from "./generation";
import { detectRetentionSignals, measurementPlanKey } from "./measurement-plan";
import { prepareInvestigation } from "./investigation";
import {
	loadDueOpenInvestigation,
	loadLatestSignalObservations,
} from "./observations";
import {
	persistInvestigation,
	retireObsoleteRetentionObservation,
} from "./persistence";

// Run this file alone with env -i and --no-env-file. Only this synthetic DB is allowed.
const databaseUrl =
	"postgresql://postgres:synthetic-only@localhost:16553/business_context_settings";
describe("obsolete retention observations in synthetic PostgreSQL", () => {
	let organizationId: string;
	let other: string;
	let websiteId: string;
	let insightId: string;
	let observationId: string;
	let plan: BusinessMeasurementPlan;
	let signal: InvestigationSignal;
	let asOf: Date;
	let revision: number;
	const domain = "reports.example.com";
	const outcome: InvestigationOutcome = {
		title: "Report return declined",
		summary: "Fewer identified profiles returned after sharing a report.",
		evidence: ["80/200 profiles returned, previously 160/200."],
		rootCause: null,
		impact: null,
		publish: true,
		next: { type: "ask", question: "Was the report flow changed?" },
	};
	beforeAll(() => {
		if (
			process.env.DATABASE_URL !== databaseUrl ||
			process.env.REDIS_URL !== "redis://localhost:16554" ||
			process.env.BULLMQ_REDIS_URL !== "redis://localhost:16554"
		) {
			throw new Error(
				"Use only synthetic PostgreSQL at localhost:16553/business_context_settings and Redis at localhost:16554"
			);
		}
	});

	const save = async (measurementPlans: BusinessMeasurementPlan[]) => {
		const saved = await saveOrganizationBusinessProfile({
			organizationId,
			revision,
			content: "Synthetic report sharing service",
			measurementPlans,
			updatedBy: "synthetic-owner",
		});
		revision = saved.profile?.revision ?? 0;
	};
	const scope = () => ({ organizationId, websiteId, asOf });
	const rows = () =>
		db
			.select()
			.from(insightObservations)
			.where(eq(insightObservations.websiteId, websiteId));
	const projection = async () =>
		(
			await db
				.select()
				.from(analyticsInsights)
				.where(eq(analyticsInsights.id, insightId))
		)[0];
	const due = async () => {
		const value = await loadDueOpenInvestigation(scope());
		if (!value) throw new Error("Expected a synthetic due observation");
		return value;
	};
	const retire = async (
		overrides: Partial<
			Parameters<typeof retireObsoleteRetentionObservation>[0]
		> = {}
	) =>
		retireObsoleteRetentionObservation({
			...scope(),
			domain,
			observation: overrides.observation ?? (await due()),
			...overrides,
		});

	beforeEach(async () => {
		organizationId = `retirement-${randomUUID()}`;
		other = `retirement-${randomUUID()}`;
		websiteId = `retirement-${randomUUID()}`;
		insightId = randomUUID();
		observationId = randomUUID();
		asOf = new Date(Date.now() + 60_000);
		revision = 0;
		plan = {
			websiteId,
			domain,
			name: "Report return",
			activationEvent: "report_shared",
			returnEvent: "report_opened",
			horizonDays: 7,
		};
		await db.insert(organization).values(
			[organizationId, other].map((id) => ({
				id,
				name: "Synthetic retirement",
				slug: id,
				createdAt: new Date(),
			}))
		);
		await db.insert(websites).values({
			id: websiteId,
			organizationId,
			domain,
			name: "Synthetic reports",
		});
		await save([plan]);
		const previous = new Date(asOf.getTime() - 86_400_000);
		signal = {
			signalKey: measurementPlanKey(plan),
			entity: {
				type: "cohort",
				id: measurementPlanKey(plan),
				label: plan.name,
			},
			metric: {
				label: "Identified retention",
				current: 40,
				previous: 80,
				format: "percent",
			},
			changePercent: -50,
			severity: "warning",
			sentiment: "negative",
			period: {
				current: { from: "2026-08-25", to: "2026-08-31" },
				previous: { from: "2026-08-18", to: "2026-08-24" },
			},
		};
		await db.insert(analyticsInsights).values({
			id: insightId,
			organizationId,
			websiteId,
			subjectKey: signal.signalKey,
			title: outcome.title,
			description: outcome.summary,
			severity: "warning",
			sentiment: "negative",
			createdAt: previous,
		});
		await db.insert(insightObservations).values({
			id: observationId,
			organizationId,
			websiteId,
			insightId,
			signalKey: signal.signalKey,
			signal,
			outcome,
			evidence: outcome.evidence,
			asOf: previous,
			createdAt: previous,
			recheckAt: previous,
		});
	});
	afterEach(async () => {
		// Delete only this test's organizations and their cascading synthetic fixtures.
		await db
			.delete(organization)
			.where(inArray(organization.id, [organizationId, other]));
	});
	afterAll(async () => {
		await shutdownPostgres();
	});

	const query =
		(eligible = 200, incomplete = 0): typeof executeQuery =>
		async (request) => {
			const today = dayjs(asOf).tz("UTC").startOf("day");
			const currentFrom = today.subtract(15, "day").format("YYYY-MM-DD");
			const retained = Math.floor(
				eligible * (request.from === currentFrom ? 0.4 : 0.8)
			);
			const row = {
				cohort_from: request.from,
				cohort_to: request.to,
				observation_end: today.subtract(1, "day").format("YYYY-MM-DD"),
				cohort_start: dayjs.tz(request.from, "UTC").toISOString(),
				cohort_end: dayjs.tz(request.to, "UTC").add(1, "day").toISOString(),
				observed_before: today.toISOString(),
				timezone: "UTC",
				horizon_days: 7,
				identity_basis: "direct_profile_id",
				activation_basis: "first_in_cohort_window",
				activated_profiles: eligible + incomplete,
				eligible_profiles: eligible,
				retained_profiles: retained,
				not_retained_profiles: eligible - retained,
				incomplete_profiles: incomplete,
				activation_events: eligible + incomplete,
				identified_activation_events: eligible + incomplete,
				unidentified_activation_events: 0,
			};
			return [
				{ ...row, row_type: "overall", cohort_date: null },
				{ ...row, row_type: "cohort", cohort_date: request.from },
			];
		};
	const discover = (
		retention: NonNullable<
			Parameters<typeof remeasureStoredSignal>[4]
		>["retention"] = { query: query() },
		mode: "production" | "shadow" = "production",
		overrides: Partial<InvestigationSources> = {}
	) => {
		const sources: InvestigationSources = {
			loadDueInvestigation: loadDueOpenInvestigation,
			loadObservations: loadLatestSignalObservations,
			remeasureSignal: (params, prior, today, abortSignal) =>
				remeasureStoredSignal(params, prior, today, abortSignal, { retention }),
			detectMetricSignals: async () => [],
			detectDefinitionSignals: async () => [],
			detectRouteHealthSignals: async () => [],
			detectRetentionSignals: async () => [],
			fetchAnnotations: async () => [],
			loadHistory: async () => [],
			loadOtherOpenWork: async () => [],
			loadErrorCustomerImpact: async () => null,
			loadRouteVitalContinuation: async () => null,
			investigateSignal: async () => {
				throw new Error("Discovery must not run a model");
			},
			...overrides,
		};
		return discoverWebsiteSignals(
			{ ...scope(), domain, timezone: "UTC" },
			{ mode, sources }
		);
	};

	it.each([
		{ activationEvent: "report_published" },
		{ returnEvent: "report_reopened" },
		{ activationEvent: "report_published", returnEvent: "report_reopened" },
		{ namespace: "production" },
		{ horizonDays: 30 as const },
	])("retires only the old due case after saved selectors change: %j", async (changes) => {
		await save([{ ...plan, ...changes }]);
		const result = await discover({
			query: async () => {
				throw new Error("Obsolete selectors must not be measured");
			},
		});
		expect(result).toMatchObject({
			kind: "empty",
			artifact: { status: "no_signals" },
		});
		expect(await projection()).toMatchObject({
			status: "resolved",
			resolvedReason: "stale",
		});
		const history = await rows();
		expect(history).toHaveLength(2);
		expect(history.find((row) => row.id === observationId)?.outcome).toEqual(
			outcome
		);
		expect(history.find((row) => row.id !== observationId)).toMatchObject({
			signal,
			insightId,
			outcome: { publish: false, next: { type: "resolve" }, rootCause: null },
		});
		expect(
			history.find((row) => row.id !== observationId)?.outcome.summary
		).toContain("recovery was not measured");
		expect(
			parseInvestigationOutcome(
				history.find((row) => row.id !== observationId)?.outcome
			)
		).not.toBeNull();
		expect(await loadDueOpenInvestigation(scope())).toBeNull();
		await discover();
		expect(await rows()).toHaveLength(2);
	});
	it("preserves the replacement definition's open case on the same website", async () => {
		const replacement = { ...plan, returnEvent: "report_reopened" };
		await save([replacement]);
		const replacementId = randomUUID();
		const replacementSignal = {
			...signal,
			signalKey: measurementPlanKey(replacement),
		};
		const recent = new Date(asOf.getTime() - 60_000);
		await db.insert(analyticsInsights).values({
			id: replacementId,
			organizationId,
			websiteId,
			subjectKey: replacementSignal.signalKey,
			title: outcome.title,
			description: outcome.summary,
			severity: "warning",
			sentiment: "negative",
			createdAt: recent,
		});
		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId,
			websiteId,
			insightId: replacementId,
			signalKey: replacementSignal.signalKey,
			signal: replacementSignal,
			outcome,
			asOf: recent,
			createdAt: recent,
			recheckAt: new Date(asOf.getTime() + 86_400_000),
		});
		await discover();
		expect(await projection()).toMatchObject({
			status: "resolved",
			resolvedReason: "stale",
		});
		const [replacementCase] = await db
			.select()
			.from(analyticsInsights)
			.where(eq(analyticsInsights.id, replacementId));
		expect(replacementCase).toMatchObject({
			status: "open",
			resolvedReason: null,
		});
		expect(await rows()).toHaveLength(3);
	});
	it("excludes a retired key even if a parallel detector read its old definition", async () => {
		const detected = await detectRetentionSignals(
			{ websiteId, lookbackDays: 7, timezone: "UTC" },
			dayjs(asOf),
			undefined,
			{ query: query() }
		);
		expect(detected).toHaveLength(1);
		await save([]);
		expect(
			await discover(undefined, "production", {
				detectRetentionSignals: async () => detected,
			})
		).toMatchObject({
			kind: "empty",
			artifact: { status: "no_signals" },
		});
		expect(await projection()).toMatchObject({
			status: "resolved",
			resolvedReason: "stale",
		});
		expect(await rows()).toHaveLength(2);
	});
	it("retires a removed definition and leaves no endlessly deferred case", async () => {
		await save([]);
		expect(await discover()).toMatchObject({
			kind: "empty",
			artifact: { status: "no_signals" },
		});
		expect(await projection()).toMatchObject({
			status: "resolved",
			resolvedReason: "stale",
		});
		expect(await loadDueOpenInvestigation(scope())).toBeNull();
	});
	it("remeasures a label-only rename without retiring or rewriting its history", async () => {
		await save([{ ...plan, name: "Renamed report return" }]);
		expect(await discover()).toMatchObject({ kind: "signals" });
		expect(await retire()).toBe(false);
		expect(await projection()).toMatchObject({
			status: "open",
			resolvedReason: null,
		});
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it.each([
		{ eligible: 49, incomplete: 0 },
		{ eligible: 200, incomplete: 1 },
	])("keeps unavailable cohorts open: %j", async ({ eligible, incomplete }) => {
		expect(
			await discover({ query: query(eligible, incomplete) })
		).toMatchObject({ kind: "empty", artifact: { status: "deferred" } });
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it.each([
		"settings",
		"analytics",
	])("leaves the persisted case unchanged after a transient %s failure", async (source) => {
		const failure = async () => {
			throw new Error("Synthetic read unavailable");
		};
		await expect(
			discover(
				source === "settings" ? { readPlan: failure } : { query: failure }
			)
		).rejects.toThrow("Synthetic read unavailable");
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it("does not mistake an empty analytics response for a removed definition", async () => {
		await expect(discover({ query: async () => [] })).rejects.toThrow();
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it.each([
		null,
		{
			content: "Synthetic context",
			origin: "team",
			revision: 3,
			updatedAt: new Date().toISOString(),
			updatedBy: "synthetic",
			sources: [],
			sourceWebsiteId: null,
		},
	])("defers when the canonical profile or selector list is unavailable", async (profile) => {
		await db
			.update(organization)
			.set({
				metadata: JSON.stringify({
					businessContext: { profile, generation: null },
				}),
			})
			.where(eq(organization.id, organizationId));
		expect(await discover()).toMatchObject({
			kind: "empty",
			artifact: { status: "deferred" },
		});
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it("does not apply a newer canonical definition to a historical recheck", async () => {
		await save([]);
		asOf = new Date(Date.now() - 60_000);
		expect(await discover()).toMatchObject({
			kind: "empty",
			artifact: { status: "deferred" },
		});
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it("keeps shadow discovery read-only for an obsolete definition", async () => {
		await save([]);
		expect(await discover(undefined, "shadow")).toMatchObject({
			kind: "empty",
			artifact: { status: "deferred" },
		});
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it("refuses a stale observation pointer or foreign tenant, website, or domain", async () => {
		await save([]);
		const observation = await due();
		for (const overrides of [
			{ observation: { ...observation, id: randomUUID() } },
			{ observation: { ...observation, insightId: randomUUID() } },
			{ organizationId: other },
			{ websiteId: randomUUID() },
			{ domain: "other.example.com" },
		])
			expect(await retire(overrides)).toBe(false);
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it("rechecks the definition at persistence if it is restored during detection", async () => {
		await save([]);
		expect(
			await discover({
				readPlan: async () => {
					await save([plan]);
					return null;
				},
			})
		).toMatchObject({ kind: "empty", artifact: { status: "deferred" } });
		expect((await due()).id).toBe(observationId);
		expect(await rows()).toHaveLength(1);
	});
	it.each([
		{ offset: -1, next: "ask", deduped: false },
		{ offset: 0, next: "ask", deduped: false },
		{ offset: 0, next: "act", deduped: false },
		{ offset: 0, next: "ask", deduped: true },
		{ offset: 0, next: "act", deduped: true },
	])("blocks older and equal-snapshot in-flight writes: %j", async ({
		offset,
		next,
		deduped,
	}) => {
		const runId = randomUUID();
		await db.insert(insightRuns).values({
			id: runId,
			organizationId,
			reason: "scheduled",
			status: "running",
		});
		if (deduped) {
			await db
				.update(analyticsInsights)
				.set({ dedupeKey: `${websiteId}|${signal.signalKey}` })
				.where(eq(analyticsInsights.id, insightId));
		}
		await save([]);
		expect(await retire()).toBe(true);
		await expect(
			persistInvestigation({
				investigation: {
					id: insightId,
					signal,
					outcome: {
						...outcome,
						next:
							next === "ask"
								? outcome.next
								: {
										type: "act",
										action: "Review the synthetic report flow",
										target: "Synthetic reports",
										verification: "Synthetic return recovers",
									},
					},
					websiteId,
					websiteDomain: domain,
					websiteName: "Synthetic reports",
				},
				organizationId,
				notNewerThan: new Date(asOf.getTime() + offset),
				recheckAt: asOf,
				runId,
				timezone: "UTC",
			})
		).rejects.toThrow("changed while scheduled analysis was running");
		expect(await projection()).toMatchObject({
			status: "resolved",
			resolvedReason: "stale",
		});
		expect(await rows()).toHaveLength(2);
	});
	it.each([
		false,
		true,
	])("allows later measured work to reopen a restored definition (deduped: %s)", async (deduped) => {
		if (deduped) {
			await db
				.update(analyticsInsights)
				.set({ dedupeKey: `${websiteId}|${signal.signalKey}` })
				.where(eq(analyticsInsights.id, insightId));
		}
		await save([]);
		expect(await retire()).toBe(true);
		await save([plan]);
		const after = new Date(asOf.getTime() + 2);
		const detected = await detectRetentionSignals(
			{ websiteId, lookbackDays: 7, timezone: "UTC" },
			dayjs(after),
			undefined,
			{ query: query() }
		);
		expect(detected).toHaveLength(1);
		const measured = prepareInvestigation(detected[0], 7);
		const runId = randomUUID();
		await db
			.insert(insightRuns)
			.values({
				id: runId,
				organizationId,
				reason: "scheduled",
				status: "running",
			});
		expect(
			await persistInvestigation({
				investigation: {
					id: insightId,
					signal: measured.signal,
					outcome,
					websiteId,
					websiteDomain: domain,
					websiteName: "Synthetic reports",
				},
				evidence: measured.evidence,
				organizationId,
				notNewerThan: after,
				recheckAt: after,
				runId,
				timezone: "UTC",
			})
		).toMatchObject({ id: insightId });
		expect(await projection()).toMatchObject({
			status: "open",
			resolvedReason: null,
		});
		expect(await rows()).toHaveLength(3);
	});
	it("does not close a case with a newer observation, including one beyond this scan", async () => {
		await save([]);
		const observation = await due();
		const newer = new Date(asOf.getTime() + 1);
		await db.insert(insightObservations).values({
			id: randomUUID(),
			organizationId,
			websiteId,
			insightId,
			signalKey: signal.signalKey,
			signal,
			outcome,
			asOf: newer,
			createdAt: newer,
			recheckAt: newer,
		});
		expect(await retire({ observation })).toBe(false);
		expect(await projection()).toMatchObject({
			status: "open",
			resolvedReason: null,
		});
		expect(await rows()).toHaveLength(2);
	});
	it("appends exactly one transition when two workers retire the same observation", async () => {
		await save([]);
		const observation = await due();
		const results = await Promise.all([
			retire({ observation }),
			retire({ observation }),
		]);
		expect(results.sort()).toEqual([false, true]);
		expect(await rows()).toHaveLength(2);
		expect(await loadDueOpenInvestigation(scope())).toBeNull();
	});
});
