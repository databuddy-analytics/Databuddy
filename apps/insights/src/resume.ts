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
import { createServiceAuth } from "@databuddy/rpc";
import {
	insightReplySlackDeliverySchema,
	parseInvestigationOutcome,
	parseInvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import {
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
} from "./agent";
import {
	loadInvestigationHistory,
	loadOtherOpenWork,
	nextRecheckAt,
} from "./observations";
import { refreshInvestigationSignal } from "./generation";
import { caseValues } from "./persistence";
import { captureInsightsError } from "./lib/evlog-insights";
import { deliverInsightSlackReply } from "./delivery";

type Investigate = (input: InsightAgentInput) => Promise<InsightAgentResult>;
type Refresh = typeof refreshInvestigationSignal;

async function deliverCompletedSlackReply(
	replyId: string,
	target: {
		organizationId: string;
		slackDelivery: unknown;
		websiteId: string;
	},
	deliver: typeof deliverInsightSlackReply
): Promise<void> {
	if (!target.slackDelivery) {
		return;
	}
	const slackDelivery = insightReplySlackDeliverySchema.parse(
		target.slackDelivery
	);
	const [observation] = await db
		.select({
			outcome: insightObservations.outcome,
			signal: insightObservations.signal,
		})
		.from(insightReplies)
		.innerJoin(
			insightObservations,
			eq(insightReplies.observationId, insightObservations.id)
		)
		.where(
			and(
				eq(insightReplies.id, replyId),
				eq(insightObservations.organizationId, target.organizationId),
				eq(insightObservations.websiteId, target.websiteId)
			)
		)
		.limit(1);
	const outcome = parseInvestigationOutcome(observation?.outcome);
	const signal = parseInvestigationSignal(observation?.signal);
	if (!(outcome && signal)) {
		throw new Error("The completed investigation result is unavailable");
	}
	await deliver({
		clientMessageId: `${replyId}-success`,
		context: {
			...slackDelivery,
			organizationId: target.organizationId,
			websiteId: target.websiteId,
		},
		result: { outcome, signal },
	});
}

export async function resumeInsightReply(
	replyId: string,
	investigate: Investigate = runInsightAgent,
	deliverSlackReply: typeof deliverInsightSlackReply = deliverInsightSlackReply,
	refresh: Refresh = refreshInvestigationSignal
): Promise<"skipped" | "succeeded"> {
	const [trigger] = await db
		.select({
			authorId: insightReplies.authorId,
			body: insightReplies.body,
			createdAt: insightReplies.createdAt,
			integrations: websites.integrations,
			organizationId: analyticsInsights.organizationId,
			slackDelivery: insightReplies.slackDelivery,
			status: insightReplies.status,
			subjectKey: analyticsInsights.subjectKey,
			timezone: analyticsInsights.timezone,
			websiteDomain: websites.domain,
			websiteId: analyticsInsights.websiteId,
			websiteName: websites.name,
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
		await deliverCompletedSlackReply(replyId, trigger, deliverSlackReply);
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

	const [current] = await db
		.select({
			createdAt: analyticsInsights.createdAt,
			id: analyticsInsights.id,
			status: analyticsInsights.status,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, trigger.organizationId),
				eq(analyticsInsights.websiteId, trigger.websiteId),
				eq(analyticsInsights.subjectKey, trigger.subjectKey)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt), desc(analyticsInsights.id))
		.limit(1);
	if (!current) {
		throw new Error("The investigation no longer exists");
	}

	const startedAt = new Date();
	const [history, otherOpenWork] = await Promise.all([
		loadInvestigationHistory({
			beforeReply: { createdAt: trigger.createdAt, id: replyId },
			organizationId: trigger.organizationId,
			signalKey: trigger.subjectKey,
			websiteId: trigger.websiteId,
		}),
		loadOtherOpenWork({
			organizationId: trigger.organizationId,
			signalKey: trigger.subjectKey,
			through: startedAt,
			websiteId: trigger.websiteId,
		}),
	]);
	let latest = history.at(-1);
	for (
		let index = history.length - 2;
		latest?.kind !== "investigation" && index >= 0;
		index -= 1
	) {
		latest = history[index];
	}
	if (!latest || latest.kind !== "investigation") {
		throw new Error("This investigation has no history to resume");
	}

	const billingCustomerId = await resolveAgentBillingCustomerId({
		organizationId: trigger.organizationId,
		userId: trigger.authorId,
	});
	if (!(await ensureAgentCreditsAvailable(billingCustomerId))) {
		throw new Error("AI usage allowance is empty");
	}
	const currentMeasurement = await refresh({
		asOf: startedAt,
		signal: latest.signal,
		timezone: trigger.timezone,
		websiteId: trigger.websiteId,
	});
	if (!currentMeasurement) {
		throw new Error("The current investigation measurement is unavailable");
	}
	const chatId = `insights:${trigger.organizationId}:${trigger.websiteId}:${currentMeasurement.signal.signalKey}`;
	const appContext: AppContext = {
		chatId,
		currentDateTime: startedAt.toISOString(),
		defaultWebsiteId: trigger.websiteId,
		mutationMode: "dry-run",
		organizationId: trigger.organizationId,
		serviceAuth: createServiceAuth(trigger.organizationId, ["read:data"]),
		timezone: trigger.timezone,
		userId: trigger.authorId ?? "system",
		websiteDomain: trigger.websiteDomain,
		websiteId: trigger.websiteId,
		websiteName: trigger.websiteName,
	};

	const result = await investigate({
		appContext,
		evidence: currentMeasurement.evidence,
		githubRepository: trigger.integrations?.github ?? null,
		history,
		otherOpenWork,
		request: {
			body: trigger.body,
			createdAt: trigger.createdAt.toISOString(),
		},
		signal: currentMeasurement.signal,
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
		const [lockedInvestigation] = await tx
			.select({
				createdAt: analyticsInsights.createdAt,
				status: analyticsInsights.status,
			})
			.from(analyticsInsights)
			.where(
				and(
					eq(analyticsInsights.id, current.id),
					eq(analyticsInsights.organizationId, trigger.organizationId),
					eq(analyticsInsights.websiteId, trigger.websiteId)
				)
			)
			.limit(1)
			.for("update");
		if (
			!lockedInvestigation ||
			lockedInvestigation.status !== current.status ||
			lockedInvestigation.createdAt.getTime() !== current.createdAt.getTime()
		) {
			throw new Error("The investigation changed while the reply was running");
		}

		const next = result.outcome.next.type;
		const shouldUpdateInvestigation =
			current.status === "open" || next === "act" || next === "ask";
		if (shouldUpdateInvestigation) {
			const open = next !== "resolve";
			await tx
				.update(analyticsInsights)
				.set({
					...caseValues(
						{ outcome: result.outcome, signal: currentMeasurement.signal },
						trigger.timezone
					),
					createdAt: committedAt,
					resolvedAt: open ? null : committedAt,
					resolvedReason: open ? null : "recovered",
					status: open ? "open" : "resolved",
				})
				.where(eq(analyticsInsights.id, current.id));
		}

		const observationId = randomUUIDv7();
		await tx.insert(insightObservations).values({
			asOf: committedAt,
			evidence: currentMeasurement.evidence,
			id: observationId,
			insightId: current.id,
			organizationId: trigger.organizationId,
			outcome: result.outcome,
			recheckAt: nextRecheckAt(committedAt, result.outcome.next),
			runId: null,
			signal: currentMeasurement.signal,
			signalKey: currentMeasurement.signal.signalKey,
			websiteId: trigger.websiteId,
		});
		await tx
			.update(insightReplies)
			.set({ observationId, status: "succeeded" })
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
		try {
			await Promise.all([
				invalidateInsightsCachesForOrganization(trigger.organizationId),
				invalidateAgentContextSnapshotsForWebsite(trigger.websiteId),
			]);
		} catch (error) {
			captureInsightsError(error, "resume.cache_invalidation.failed", {
				organization_id: trigger.organizationId,
				website_id: trigger.websiteId,
			});
		}
	}
	await deliverCompletedSlackReply(replyId, trigger, deliverSlackReply);
	return "succeeded";
}

export async function recordInsightReplyFailure(
	replyId: string,
	finalAttempt: boolean,
	deliverSlackFailure: typeof deliverInsightSlackReply = deliverInsightSlackReply
): Promise<void> {
	const [failed] = await db
		.update(insightReplies)
		.set({ status: finalAttempt ? "failed" : "queued" })
		.where(
			and(
				eq(insightReplies.id, replyId),
				ne(insightReplies.status, "succeeded")
			)
		)
		.returning({ slackDelivery: insightReplies.slackDelivery });
	if (!(finalAttempt && failed?.slackDelivery)) {
		return;
	}
	const slackDelivery = insightReplySlackDeliverySchema.parse(
		failed.slackDelivery
	);
	const [target] = await db
		.select({
			organizationId: analyticsInsights.organizationId,
			websiteId: analyticsInsights.websiteId,
		})
		.from(insightReplies)
		.innerJoin(
			analyticsInsights,
			eq(insightReplies.insightId, analyticsInsights.id)
		)
		.where(eq(insightReplies.id, replyId))
		.limit(1);
	if (!target) {
		return;
	}
	await deliverSlackFailure({
		clientMessageId: `${replyId}-failure`,
		context: { ...slackDelivery, ...target },
		result: null,
	});
}
