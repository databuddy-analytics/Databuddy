import "@databuddy/test/env";
import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
	analyticsInsights,
	insightObservations,
	insightRunItems,
	insightRuns,
	insightReplies,
	websites,
} from "@databuddy/db/schema";
import {
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	truncatePostgres,
} from "@databuddy/test";
import { eq } from "drizzle-orm";
import * as memory from "@databuddy/services/business-memory";
import { randomUUIDv7 } from "bun";
import {
	loadCurrentBusinessScope,
	organizationProfileContext,
	withBusinessContextSnapshot,
	readPersistedBusinessReplies,
} from "./business-context";

import type {
	BusinessContext,
	BusinessScope,
} from "@databuddy/ai/lib/business-context";
import { parseInvestigationOutcome } from "@databuddy/shared/insights";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import type { OrganizationBusinessProfile } from "@databuddy/shared/organization-business-context";
import { generateWebsiteInsights } from "./generation";
import { prepareInvestigation } from "./investigation";
import { persistInvestigation } from "./persistence";
import { recordInsightReplyFailure, resumeInsightReply } from "./resume";

const prepared = prepareInvestigation(
	{
		baseline: 100,
		current: 20,
		deltaPercent: -80,
		detectedAt: "2026-09-04",
		direction: "down",
		label: "report_prepared",
		method: "wow",
		metric: "custom_event_reach",
		severity: "warning",
		subjectKey: "custom_event_reach:report_prepared",
		entityId: "report_prepared",
		entityLabel: "Report preparation",
	},
	7
);
const outcome: InvestigationOutcome = {
	evidence: ["Report preparation participation fell."],
	impact: "Report preparation affects paid workspaces.",
	next: {
		type: "ask",
		question: "Was report preparation intentionally changed?",
	},
	publish: true,
	rootCause: null,
	summary: "Recorded participation fell from 100 to 20.",
	title: "Original scope result",
};

async function scopeFixture() {
	const org = await insertOrganization();
	const website = await insertWebsite({
		organizationId: org.id,
		domain: "example.com",
	});
	const scope = {
		organizationId: org.id,
		websiteId: website.id,
		domain: website.domain,
		startedAt: "2026-09-01T00:00:00.000Z",
	};
	await db()
		.update(websites)
		.set({ settings: { businessContextStartedAt: scope.startedAt } })
		.where(eq(websites.id, website.id));
	expect(await loadCurrentBusinessScope(scope)).toEqual(scope);
	return { org, website, scope };
}

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb
		? describe
		: describe.skip;

integration("persisted business reply scope", () => {
	beforeEach(async () => {
		await truncatePostgres();
	});
	afterAll(async () => {
		await closePostgres();
	});

	it("persists the original revision and appends the newly supplied revision on resume", async () => {
		const { org, website, scope } = await scopeFixture();
		const saved: OrganizationBusinessProfile = {
			content: "Report preparation starts a draft.",
			origin: "mixed",
			teamContext: { priority: "Report preparation", successDefinition: "A draft is prepared", exclusions: "Employee traffic" },
			revision: 3,
			updatedAt: "2026-09-04T00:00:00.000Z",
			updatedBy: "example-editor",
			sourceWebsiteId: null,
			sources: [{ title: "Report guide", url: "https://example.com/reports" }],
		};
		const capturedAt = new Date("2026-09-05T12:00:00.000Z");
		const firstContext = organizationProfileContext(saved, org.id, capturedAt);
		const original = withBusinessContextSnapshot(outcome, firstContext);
		const runId = randomUUIDv7();
		await db()
			.insert(insightRuns)
			.values({ id: runId, organizationId: org.id, status: "running" });
		const investigation = await persistInvestigation({
			businessScope: scope,
			organizationId: org.id,
			runId,
			timezone: "UTC",
			notNewerThan: capturedAt,
			recheckAt: new Date("2026-09-08T12:00:00.000Z"),
			investigation: {
				id: randomUUIDv7(),
				outcome: original,
				signal: prepared.signal,
				websiteDomain: website.domain,
				websiteId: website.id,
				websiteName: website.name,
			},
		});
		if (!investigation) throw new Error("Expected a durable investigation");
		const replyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			id: replyId,
			insightId: investigation.id,
			authorName: "Example teammate",
			body: "Please check the revised business priority.",
			status: "queued",
		});
		saved.revision = 4;
		saved.content = "Completed downloads are the current priority.";
		saved.teamContext = { priority: "Completed downloads", successDefinition: "A download completes", exclusions: "Employee traffic" };
		saved.updatedAt = "2026-09-06T00:00:00.000Z";
		let supplied: BusinessContext | undefined;
		let models = 0;
		const billingKey = process.env.AUTUMN_SECRET_KEY;
		Reflect.deleteProperty(process.env, "AUTUMN_SECRET_KEY");
		try {
			expect(
				await resumeInsightReply(
					replyId,
					async (input) => {
						models += 1;
						supplied = input.businessContext;
						expect(supplied?.sources[0]?.profileVersion?.revision).toBe(4);
						// A save during the model turn must not rewrite the supplied snapshot.
						saved.revision = 5;
						saved.content = "Later priority, never supplied to this turn.";
						saved.teamContext = { priority: "Later priority", successDefinition: "", exclusions: "" };
						return {
							outcome: { ...original, title: "Revised priority checked" },
							toolCallCount: 0,
						};
					},
					async () => {},
					async () => prepared,
					{
						loadCurrentBusinessScope,
						loadBusinessProfile: async (input) => {
							expect(input.scope).toEqual(scope);
							return organizationProfileContext(
								saved,
								input.scope.organizationId,
								input.asOf
							);
						},
						recallBusinessContext: async (input) => ({
							capturedAt: input.asOf.toISOString(),
							status: "disabled",
							sources: [],
							issues: [],
						}),
					}
				)
			).toBe("succeeded");
			// Completed retries do not load the newly edited profile or append a turn.
			expect(
				await resumeInsightReply(replyId, async () => {
					throw new Error("A completed reply must not run the model again");
				})
			).toBe("succeeded");
		} finally {
			if (billingKey === undefined) Reflect.deleteProperty(process.env, "AUTUMN_SECRET_KEY");
			else process.env.AUTUMN_SECRET_KEY = billingKey;
		}
		const rows = await db()
			.select({ outcome: insightObservations.outcome })
			.from(insightObservations)
			.where(eq(insightObservations.insightId, investigation.id))
			.orderBy(insightObservations.asOf);
		expect(rows).toHaveLength(2);
		expect(models).toBe(1);
		expect(
			parseInvestigationOutcome(rows[0]?.outcome)?.contextSnapshot
		).toEqual(firstContext);
		expect(
			parseInvestigationOutcome(rows[1]?.outcome)?.contextSnapshot
		).toEqual(supplied);
		expect(
			parseInvestigationOutcome(rows[1]?.outcome)?.contextSnapshot?.sources[1]
		).toMatchObject({
			origin: "mixed",
			content: "Completed downloads are the current priority.",
			profileVersion: { revision: 4, updatedAt: "2026-09-06T00:00:00.000Z" },
			references: [
				{ title: "Report guide", url: "https://example.com/reports" },
			],
		});
		const persistedTeam = parseInvestigationOutcome(rows[1]?.outcome)?.contextSnapshot?.sources[0];
		expect(persistedTeam).toMatchObject({
			origin: "team",
			author: "Team priorities and definitions",
			profileVersion: { revision: 4, updatedAt: "2026-09-06T00:00:00.000Z" },
		});
		expect(persistedTeam?.content).toContain("Completed downloads");
		expect(persistedTeam?.content).toContain("A download completes");
		expect(persistedTeam?.content).not.toContain("Later priority");
	});

	it("bounds recent replies but can recover exact-subject context while excluding other scopes and unsafe dates", async () => {
		const firstOrg = await insertOrganization();
		const secondOrg = await insertOrganization();
		const first = await insertWebsite({
			domain: "example.com",
			organizationId: firstOrg.id,
		});
		const second = await insertWebsite({
			domain: "example.com",
			organizationId: secondOrg.id,
		});
		const changedAt = new Date("2026-08-01T00:00:00Z");
		await db()
			.update(websites)
			.set({
				settings: { businessContextStartedAt: changedAt.toISOString() },
				updatedAt: changedAt,
			})
			.where(eq(websites.id, first.id));
		const subjectKey = "custom_event_reach:report_prepared";
		const primary = randomUUIDv7();
		const otherSubject = randomUUIDv7();
		const otherOrg = randomUUIDv7();
		await db()
			.insert(analyticsInsights)
			.values(
				[
					{
						id: primary,
						organizationId: firstOrg.id,
						websiteId: first.id,
						subjectKey,
					},
					{
						id: otherSubject,
						organizationId: firstOrg.id,
						websiteId: first.id,
						subjectKey: "goal:signup",
					},
					{
						id: otherOrg,
						organizationId: secondOrg.id,
						websiteId: second.id,
						subjectKey,
					},
				].map((row) => ({
					...row,
					title: "Example investigation",
					description: "Example description",
					sentiment: "negative" as const,
					severity: "warning" as const,
				}))
			);
		const correction = randomUUIDv7();
		await db()
			.insert(insightReplies)
			.values([
				{
					id: correction,
					insightId: primary,
					body: "Report preparation is not a completed download.",
					createdAt: new Date("2026-08-02T00:00:00Z"),
					authorName: "Example teammate",
				},
				{
					id: randomUUIDv7(),
					insightId: primary,
					body: "Pre-domain-change context",
					createdAt: new Date("2026-07-31T23:59:59Z"),
					authorName: "Example teammate",
				},
				{
					id: randomUUIDv7(),
					insightId: primary,
					body: "Future context",
					createdAt: new Date("2026-09-06T00:00:00Z"),
					authorName: "Example teammate",
				},
				{
					id: randomUUIDv7(),
					insightId: otherOrg,
					body: "Other organization context",
					createdAt: new Date("2026-08-03T00:00:00Z"),
					authorName: "Example teammate",
				},
				{
					id: randomUUIDv7(),
					insightId: primary,
					body: "Definition changed automatically",
					createdAt: new Date("2026-08-04T00:00:00Z"),
					authorName: "Databuddy",
				},
				{
					id: randomUUIDv7(),
					insightId: primary,
					body: "Databuddy applied the goal action. Recheck its verification condition against current data.",
					createdAt: new Date("2026-08-04T00:00:00Z"),
					authorName: "Example teammate",
				},
				...Array.from({ length: 20 }, (_, index) => ({
					id: randomUUIDv7(),
					insightId: otherSubject,
					body: `Other-subject statement ${index}`,
					createdAt: new Date(
						`2026-08-${String(index + 5).padStart(2, "0")}T00:00:00Z`
					),
					authorName: "Example teammate",
				})),
			]);
		const scope = {
			organizationId: firstOrg.id,
			websiteId: first.id,
			domain: "example.com",
			startedAt: changedAt.toISOString(),
		};
		const asOf = new Date("2026-09-05T00:00:00Z");
		const recent = await readPersistedBusinessReplies({ scope, asOf });
		expect(recent).toHaveLength(16);
		expect(recent.some((source) => source.id === correction)).toBe(false);
		const exact = await readPersistedBusinessReplies({
			scope,
			asOf,
			subjectKey,
		});
		expect(exact).toEqual([
			{
				id: correction,
				kind: "team_reply",
				observedAt: "2026-08-02T00:00:00.000Z",
				subjectKey,
				author: "Example teammate",
				content: "Report preparation is not a completed download.",
			},
		]);
		// Routine edits advance updatedAt but keep the scope epoch; an unindexed
		// correction must remain eligible for later provider recovery.
		await db()
			.update(websites)
			.set({
				name: "Renamed",
				isPublic: true,
				settings: {
					businessContextStartedAt: scope.startedAt,
					allowedOrigins: ["https://example.com"],
				},
				updatedAt: new Date("2026-09-04T00:00:00Z"),
			})
			.where(eq(websites.id, first.id));
		expect(
			await readPersistedBusinessReplies({ scope, asOf, subjectKey })
		).toEqual(exact);
		expect(
			await readPersistedBusinessReplies({
				scope: { ...scope, startedAt: undefined },
				asOf,
			})
		).toEqual([]);

		expect(
			await readPersistedBusinessReplies({
				scope: { ...scope, domain: "other.example.com" },
				asOf,
			})
		).toEqual([]);
		expect(
			await readPersistedBusinessReplies({
				scope: { ...scope, organizationId: secondOrg.id },
				asOf,
			})
		).toEqual([]);
		// Returning to the original domain uses a new epoch and cannot revive
		// old replies. Stale captured scopes also stop matching the joined row.
		const newScope = { ...scope, startedAt: "2026-09-05T00:00:00.000Z" };
		await db()
			.update(websites)
			.set({ settings: { businessContextStartedAt: newScope.startedAt } })
			.where(eq(websites.id, first.id));
		expect(await readPersistedBusinessReplies({ scope, asOf })).toEqual([]);
		expect(
			await readPersistedBusinessReplies({ scope: newScope, asOf })
		).toEqual([]);

		await db()
			.update(websites)
			.set({ deletedAt: new Date() })
			.where(eq(websites.id, first.id));
		expect(await readPersistedBusinessReplies({ scope, asOf })).toEqual([]);
	});
	it.each([
		"rotation",
		"lookup failure",
	])("rejects a frozen generation retry after scope %s without changing the plan or saving outcomes", async (failure) => {
		const { org, website, scope } = await scopeFixture();
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		const plan = {
			asOf: "2026-09-05T12:00:00.000Z",
			reason: "manual",
			businessScope: scope,
			candidates: [
				{
					...prepared,
					businessContext: {
						capturedAt: "2026-09-05T12:00:00.000Z",
						status: "ready",
						issues: [],
						sources: [
							{
								id: "team-context",
								kind: "team_reply",
								content: "This is paid report preparation.",
								observedAt: "2026-09-04T12:00:00.000Z",
							},
						],
					},
				},
			],
		};
		await db()
			.insert(insightRuns)
			.values({ id: runId, organizationId: org.id, status: "running" });
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			queueJobId,
			status: "running",
			candidatePlan: plan,
		});
		const lookup = spyOn(memory, "getWebsiteBusinessScope");
		try {
			if (failure === "lookup failure") {
				lookup.mockRejectedValue(
					new Error("Native scope database unavailable")
				);
			} else {
				await db()
					.update(websites)
					.set({
						settings: { businessContextStartedAt: "2026-09-06T00:00:00.000Z" },
					})
					.where(eq(websites.id, website.id));
			}
			await expect(
				generateWebsiteInsights({
					finalAttempt: false,
					itemId,
					organizationId: org.id,
					queueJobId,
					reason: "manual",
					requestedByUserId: null,
					runId,
					timezone: "UTC",
					websiteId: website.id,
				})
			).rejects.toThrow(
				failure === "rotation"
					? "start a new run"
					: "Native scope database unavailable"
			);
		} finally {
			lookup.mockRestore();
		}
		expect(
			await db()
				.select({ id: insightObservations.id })
				.from(insightObservations)
		).toHaveLength(0);
		const [item] = await db()
			.select({ plan: insightRunItems.candidatePlan })
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(item?.plan).toEqual(plan);
	});

	it("persists through routine edits but rolls back a stale generation outcome after epoch rotation", async () => {
		const { org, website, scope } = await scopeFixture();
		const investigation = {
			id: randomUUIDv7(),
			outcome,
			signal: prepared.signal,
			websiteDomain: website.domain,
			websiteId: website.id,
			websiteName: website.name,
		};
		const params = {
			businessScope: scope,
			investigation,
			notNewerThan: new Date("2026-09-05T12:00:00.000Z"),
			organizationId: org.id,
			recheckAt: new Date("2026-09-08T12:00:00.000Z"),
			runId: randomUUIDv7(),
			timezone: "UTC",
		};
		const staleRunId = randomUUIDv7();
		await db()
			.insert(insightRuns)
			.values({ id: params.runId, organizationId: org.id, status: "running" });
		await db()
			.update(websites)
			.set({ name: "Renamed", isPublic: true })
			.where(eq(websites.id, website.id));
		await persistInvestigation(params);
		await db()
			.update(insightRuns)
			.set({ status: "succeeded" })
			.where(eq(insightRuns.id, params.runId));
		await db()
			.insert(insightRuns)
			.values({ id: staleRunId, organizationId: org.id, status: "running" });
		await db()
			.update(websites)
			.set({
				settings: { businessContextStartedAt: "2026-09-06T00:00:00.000Z" },
			})
			.where(eq(websites.id, website.id));
		await expect(
			persistInvestigation({
				...params,
				runId: staleRunId,
				investigation: {
					...investigation,
					outcome: { ...outcome, title: "Stale result must not commit" },
				},
			})
		).rejects.toThrow("scope changed");
		expect(
			await db()
				.select({ title: analyticsInsights.title })
				.from(analyticsInsights)
		).toEqual([{ title: outcome.title }]);
		expect(
			await db()
				.select({ id: insightObservations.id })
				.from(insightObservations)
		).toHaveLength(1);
	});

	it.each([
		"rotation",
		"lookup failure",
		"provider failure",
	])("handles reply scope %s without allowing an unbound outcome", async (failure) => {
		const { org, website, scope } = await scopeFixture();
		const insightId = randomUUIDv7();
		const replyId = randomUUIDv7();
		await db()
			.insert(analyticsInsights)
			.values({
				id: insightId,
				organizationId: org.id,
				websiteId: website.id,
				title: outcome.title,
				description: outcome.summary,
				severity: "warning",
				sentiment: "negative",
				subjectKey: prepared.signal.signalKey,
				timezone: "UTC",
				createdAt: new Date("2026-09-04T00:00:00.000Z"),
			});
		await db()
			.insert(insightObservations)
			.values({
				id: randomUUIDv7(),
				insightId,
				organizationId: org.id,
				websiteId: website.id,
				outcome,
				signal: prepared.signal,
				signalKey: prepared.signal.signalKey,
				asOf: new Date("2026-09-04T00:00:00.000Z"),
				createdAt: new Date("2026-09-04T00:00:00.000Z"),
				recheckAt: new Date("2026-09-08T00:00:00.000Z"),
				runId: null,
			});
		await db()
			.insert(insightReplies)
			.values({
				id: replyId,
				insightId,
				authorName: "Example teammate",
				body: "Preparation is not download completion.",
				createdAt: new Date("2026-09-05T00:00:00.000Z"),
				status: "queued",
			});
		let models = 0;
		let deliveries = 0;
		let reads = 0;
		const source = async (params: {
			scope: BusinessScope;
			asOf: Date;
		}): Promise<BusinessContext> => {
			reads += 1;
			expect(params.scope).toEqual(scope);
			if (failure === "provider failure") {
				throw new Error("Optional memory unavailable");
			}
			return {
				capturedAt: params.asOf.toISOString(),
				status: "ready",
				issues: [],
				sources: await readPersistedBusinessReplies(params),
			};
		};
		const billingKey = process.env.AUTUMN_SECRET_KEY;
		delete process.env.AUTUMN_SECRET_KEY;
		const lookup = spyOn(memory, "getWebsiteBusinessScope");
		if (failure === "lookup failure") {
			lookup.mockRejectedValue(new Error("Native scope database unavailable"));
		}
		try {
			const resumed = resumeInsightReply(
				replyId,
				async (input) => {
					models += 1;
					if (failure === "provider failure") {
						expect(input.businessContext).toMatchObject({
							status: "unavailable",
							sources: [],
						});
					} else {
						expect(input.businessContext?.sources).toHaveLength(1);
						expect(input.businessContext?.sources[0]).toMatchObject({
							id: replyId,
							content: "Preparation is not download completion.",
						});
						// This completes inside the model callback: there is no website lock
						// held across the model. Commit must notice the actual DB epoch change.
						await db()
							.update(websites)
							.set({
								domain: "other.example",
								settings: {
									businessContextStartedAt: "2026-09-06T00:00:00.000Z",
								},
							})
							.where(eq(websites.id, website.id));
					}
					return {
						outcome: { ...outcome, title: "Reply result" },
						toolCallCount: 0,
					};
				},
				async () => {
					deliveries += 1;
				},
				async () => prepared,
				{
					loadCurrentBusinessScope,
					loadBusinessProfile: source,
					recallBusinessContext: source,
				}
			);
			if (failure === "provider failure") {
				expect(await resumed).toBe("succeeded");
			} else {
				await expect(resumed).rejects.toThrow(
					failure === "rotation"
						? "scope changed"
						: "Native scope database unavailable"
				);
			}
		} finally {
			lookup.mockRestore();
			if (billingKey === undefined) delete process.env.AUTUMN_SECRET_KEY;
			else process.env.AUTUMN_SECRET_KEY = billingKey;
		}
		expect({ models, reads, deliveries }).toEqual({
			models: failure === "lookup failure" ? 0 : 1,
			reads: failure === "lookup failure" ? 0 : 2,
			deliveries: 0,
		});
		expect(
			await db()
				.select({ title: analyticsInsights.title })
				.from(analyticsInsights)
		).toEqual([
			{
				title: failure === "provider failure" ? "Reply result" : outcome.title,
			},
		]);
		expect(
			await db()
				.select({ id: insightObservations.id })
				.from(insightObservations)
		).toHaveLength(failure === "provider failure" ? 2 : 1);
		if (failure === "provider failure") {
			return;
		}
		await recordInsightReplyFailure(replyId, false);
		expect(
			await db()
				.select({
					status: insightReplies.status,
					observationId: insightReplies.observationId,
				})
				.from(insightReplies)
		).toEqual([{ status: "queued", observationId: null }]);
	});
});
