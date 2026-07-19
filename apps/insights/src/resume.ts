import type { AppContext } from "@databuddy/ai/config/context";
import {
	ensureAgentCreditsAvailable,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "@databuddy/ai/agents/execution";
import { and, db, desc, eq, inArray, isNull, ne } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
	websites,
} from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import {
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
} from "./agent";
import { loadInvestigationHistory, nextRecheckAt } from "./observations";
import { caseValues, isVisibleInvestigation } from "./persistence";
import { captureInsightsError } from "./lib/evlog-insights";

type Investigate = (input: InsightAgentInput) => Promise<InsightAgentResult>;

async function invalidateCaseCaches(
	organizationId: string,
	websiteId: string
): Promise<void> {
	try {
		await Promise.all([
			invalidateInsightsCachesForOrganization(organizationId),
			invalidateAgentContextSnapshotsForWebsite(websiteId),
		]);
	} catch (error) {
		captureInsightsError(error, "resume.cache_invalidation.failed", {
			organization_id: organizationId,
			website_id: websiteId,
		});
	}
}

export async function resumeInsightReply(
	replyId: string,
	investigate: Investigate = runInsightAgent
): Promise<"skipped" | "succeeded"> {
	const [trigger] = await db
		.select({
			authorId: insightReplies.authorId,
			body: insightReplies.body,
			createdAt: insightReplies.createdAt,
			insightId: analyticsInsights.id,
			integrations: websites.integrations,
			organizationId: analyticsInsights.organizationId,
			status: insightReplies.status,
			subjectKey: analyticsInsights.subjectKey,
			timezone: analyticsInsights.timezone,
			websiteDomain: websites.domain,
			websiteId: analyticsInsights.websiteId,
		})
		.from(insightReplies)
		.innerJoin(
			analyticsInsights,
			eq(insightReplies.insightId, analyticsInsights.id)
		)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(and(eq(insightReplies.id, replyId), isNull(websites.deletedAt)))
		.limit(1);

	if (!trigger) {
		return "skipped";
	}
	if (trigger.status === "succeeded") {
		return "succeeded";
	}

	const started = await db
		.update(insightReplies)
		.set({ status: "running" })
		.where(
			and(
				eq(insightReplies.id, replyId),
				inArray(insightReplies.status, ["queued", "running"])
			)
		)
		.returning({ id: insightReplies.id });
	if (started.length === 0) {
		return "skipped";
	}

	const hasSubject = trigger.subjectKey.trim().length > 0;
	const [current] = await db
		.select({
			createdAt: analyticsInsights.createdAt,
			id: analyticsInsights.id,
		})
		.from(analyticsInsights)
		.where(
			hasSubject
				? and(
						eq(analyticsInsights.organizationId, trigger.organizationId),
						eq(analyticsInsights.websiteId, trigger.websiteId),
						eq(analyticsInsights.subjectKey, trigger.subjectKey)
					)
				: eq(analyticsInsights.id, trigger.insightId)
		)
		.orderBy(desc(analyticsInsights.createdAt), desc(analyticsInsights.id))
		.limit(1);
	if (!current) {
		throw new Error("The investigation no longer exists");
	}

	const history = await loadInvestigationHistory({
		beforeReply: { createdAt: trigger.createdAt, id: replyId },
		insightId: trigger.insightId,
		organizationId: trigger.organizationId,
		signalKey: trigger.subjectKey,
		websiteId: trigger.websiteId,
	});
	let latest = history.at(-1);
	for (
		let index = history.length - 2;
		latest?.kind !== "investigation" && index >= 0;
		index -= 1
	) {
		latest = history[index];
	}
	if (!latest || latest.kind !== "investigation") {
		throw new Error(
			"This older finding has no investigation history to resume"
		);
	}

	const startedAt = new Date();
	const chatId = `insights:${trigger.organizationId}:${trigger.websiteId}:${latest.signal.signalKey}`;
	const appContext: AppContext = {
		chatId,
		currentDateTime: startedAt.toISOString(),
		defaultWebsiteId: trigger.websiteId,
		mutationMode: "dry-run",
		organizationId: trigger.organizationId,
		timezone: trigger.timezone,
		userId: trigger.authorId ?? "system",
		websiteDomain: trigger.websiteDomain,
		websiteId: trigger.websiteId,
	};
	const billingCustomerId = await resolveAgentBillingCustomerId({
		organizationId: trigger.organizationId,
		userId: trigger.authorId,
	});
	if (!(await ensureAgentCreditsAvailable(billingCustomerId))) {
		throw new Error("AI usage allowance is empty");
	}

	const result = await investigate({
		appContext,
		evidence: latest.evidence,
		githubRepository: trigger.integrations?.github ?? null,
		history,
		request: {
			body: trigger.body,
			createdAt: trigger.createdAt.toISOString(),
		},
		signal: latest.signal,
	});
	const committed = await db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ status: insightReplies.status })
			.from(insightReplies)
			.where(eq(insightReplies.id, replyId))
			.limit(1)
			.for("update");
		if (!locked) {
			throw new Error("The investigation reply no longer exists");
		}
		if (locked.status === "succeeded") {
			return false;
		}

		const committedAt = new Date();
		const visible = isVisibleInvestigation({ outcome: result.outcome });
		const resolvedReason = visible
			? null
			: result.outcome.next.type === "resolve"
				? ("recovered" as const)
				: ("stale" as const);
		const updated = await tx
			.update(analyticsInsights)
			.set({
				...caseValues(
					{ outcome: result.outcome, signal: latest.signal },
					trigger.timezone
				),
				createdAt: committedAt,
				resolvedAt: visible ? null : committedAt,
				resolvedReason,
				status: visible ? "open" : "resolved",
			})
			.where(
				and(
					eq(analyticsInsights.id, current.id),
					eq(analyticsInsights.organizationId, trigger.organizationId),
					eq(analyticsInsights.websiteId, trigger.websiteId),
					eq(analyticsInsights.createdAt, current.createdAt)
				)
			)
			.returning({ id: analyticsInsights.id });
		if (updated.length === 0) {
			throw new Error("The investigation changed while the reply was running");
		}

		await tx.insert(insightObservations).values({
			asOf: committedAt,
			evidence: latest.evidence,
			id: randomUUIDv7(),
			insightId: current.id,
			organizationId: trigger.organizationId,
			outcome: result.outcome,
			recheckAt: nextRecheckAt(committedAt, result.outcome.next.type),
			runId: null,
			signal: latest.signal,
			signalKey: latest.signal.signalKey,
			websiteId: trigger.websiteId,
		});
		await tx
			.update(insightReplies)
			.set({ status: "succeeded" })
			.where(eq(insightReplies.id, replyId));
		return true;
	});

	if (committed) {
		if (result.modelId && result.usage) {
			try {
				await trackAgentUsageAndBill({
					billingCustomerId,
					chatId,
					idempotencyKey: `insights:reply:${replyId}`,
					modelId: result.modelId,
					organizationId: trigger.organizationId,
					source: "insights",
					usage: result.usage,
					userId: trigger.authorId,
					websiteId: trigger.websiteId,
				});
			} catch (error) {
				captureInsightsError(error, "resume.billing.failed", {
					organization_id: trigger.organizationId,
					reply_id: replyId,
					website_id: trigger.websiteId,
				});
			}
		}
		await invalidateCaseCaches(trigger.organizationId, trigger.websiteId);
	}
	return "succeeded";
}

export async function recordInsightReplyFailure(
	replyId: string,
	finalAttempt: boolean
): Promise<void> {
	await db
		.update(insightReplies)
		.set({ status: finalAttempt ? "failed" : "queued" })
		.where(
			and(
				eq(insightReplies.id, replyId),
				ne(insightReplies.status, "succeeded")
			)
		);
}
