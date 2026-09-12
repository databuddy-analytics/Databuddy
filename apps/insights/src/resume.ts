import { isDeepStrictEqual } from "node:util";
import { mergeBusinessContext } from "@databuddy/ai/lib/business-context";
import {
	assertBusinessScopeCurrent,
	loadCurrentBusinessScope,
	loadWebsiteBusinessProfile,
	recallWebsiteBusinessContext,
	unavailableBusinessContext,
	withBusinessContextSnapshot,
} from "./business-context";
import type { AppContext } from "@databuddy/ai/config/context";
import { trackAgentUsage } from "@databuddy/ai/agents/execution";
import { and, db, desc, eq, inArray, isNull, lte, ne } from "@databuddy/db";
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
	appliedInsightActionReply,
	insightReplySlackDeliverySchema,
	parseInvestigationOutcome,
	parseInvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import {
	type InsightAgentInput,
	type InsightAgentResult,
	runInsightAgent,
	clarifyInsight,
	InsightAgentExecutionError,
} from "./agent";
import {
	loadInvestigationHistory,
	loadClarificationContext,
	loadOtherOpenWork,
	nextRecheckAt,
} from "./observations";
import { refreshInvestigationSignal } from "./generation";
import { caseValues } from "./persistence";
import { captureInsightsError } from "./lib/evlog-insights";
import { deliverInsightSlackReply } from "./delivery";

import {
	resolveInvestigationBilling,
	reserveInvestigationCharge,
	commitInvestigationCharge,
	settleInvestigationCharge,
	releaseInvestigationChargeForOperation,
} from "./investigation-billing";

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
			assistantText: insightReplies.assistantText,
			signal: insightObservations.signal,
		})
		.from(insightReplies)
		.innerJoin(
			analyticsInsights,
			eq(insightReplies.insightId, analyticsInsights.id)
		)
		.leftJoin(
			insightObservations,
			eq(insightReplies.observationId, insightObservations.id)
		)
		.where(
			and(
				eq(insightReplies.id, replyId),
				eq(analyticsInsights.organizationId, target.organizationId),
				eq(analyticsInsights.websiteId, target.websiteId)
			)
		)
		.limit(1);
	if (observation?.assistantText) {
		await deliver({
			clientMessageId: `${replyId}-success`,
			context: {
				...slackDelivery,
				organizationId: target.organizationId,
				websiteId: target.websiteId,
			},
			result: null,
			text: observation.assistantText,
		});
		return;
	}
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
	refresh: Refresh = refreshInvestigationSignal,
	business = {
		loadCurrentBusinessScope,
		loadBusinessProfile: loadWebsiteBusinessProfile,
		recallBusinessContext: recallWebsiteBusinessContext,
	},
	clarify: typeof clarifyInsight = clarifyInsight
): Promise<"skipped" | "succeeded"> {
	const [trigger] = await db
		.select({
			authorId: insightReplies.authorId,
			authorName: insightReplies.authorName,
			body: insightReplies.body,
			intent: insightReplies.intent,
			sourceObservationId: insightReplies.sourceObservationId,
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
		.innerJoin(
			websites,
			and(
				eq(analyticsInsights.websiteId, websites.id),
				eq(analyticsInsights.organizationId, websites.organizationId)
			)
		)
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

	const legacyVerification =
		trigger.sourceObservationId === null &&
		(["goal", "funnel"] as const).some(
			(type) =>
				trigger.body === appliedInsightActionReply(type) ||
				(trigger.authorId === null &&
					trigger.authorName === "Databuddy" &&
					trigger.body ===
						`Databuddy detected a ${type} definition change. Recheck the current evidence and resolve this investigation if the change addressed it.`)
		);
	const intent = legacyVerification ? "verification" : trigger.intent;
	const track = (answer: {
		modelId?: string;
		usage?: InsightAgentResult["usage"];
	}) => {
		if (answer.modelId && answer.usage) {
			trackAgentUsage({
				modelId: answer.modelId,
				usage: answer.usage,
				source: "insights",
				organizationId: trigger.organizationId,
				websiteId: trigger.websiteId,
				userId: trigger.authorId,
				chatId: `insights:${intent}:${replyId}`,
			});
		}
	};
	if (intent === "clarification") {
		const saved = await loadClarificationContext({
			sourceObservationId: trigger.sourceObservationId,
			organizationId: trigger.organizationId,
			websiteId: trigger.websiteId,
			signalKey: trigger.subjectKey,
			beforeReply: { createdAt: trigger.createdAt, id: replyId },
		});
		const answer = await clarify({
			...saved,
			organizationId: trigger.organizationId,
			websiteId: trigger.websiteId,
			signalKey: trigger.subjectKey,
			question: trigger.body,
		}).catch((error) => {
			if (error instanceof InsightAgentExecutionError) {
				track(error);
			}
			throw error;
		});
		trackAgentUsage({
			modelId: answer.modelId,
			usage: answer.usage,
			source: "insights",
			organizationId: trigger.organizationId,
			websiteId: trigger.websiteId,
			userId: trigger.authorId,
			chatId: `insights:clarification:${replyId}`,
		});
		await db.transaction(async (tx) => {
			const [site] = await tx
				.select({ id: websites.id })
				.from(websites)
				.where(
					and(
						eq(websites.id, trigger.websiteId),
						eq(websites.organizationId, trigger.organizationId),
						isNull(websites.deletedAt)
					)
				)
				.for("update");
			if (!site) {
				throw new Error("This investigation's website access changed");
			}
			await tx
				.update(insightReplies)
				.set({ assistantText: answer.text, status: "succeeded" })
				.where(
					and(
						eq(insightReplies.id, replyId),
						eq(insightReplies.status, "running")
					)
				);
		});
		try {
			await invalidateInsightsCachesForOrganization(trigger.organizationId);
		} catch (error) {
			captureInsightsError(error, "resume.cache_invalidation.failed", {
				organization_id: trigger.organizationId,
				website_id: trigger.websiteId,
			});
		}
		await deliverCompletedSlackReply(replyId, trigger, deliverSlackReply);
		return "succeeded";
	}

	let charge:
		| Awaited<ReturnType<typeof reserveInvestigationCharge>>
		| undefined;
	if (intent === "analysis") {
		const billing = await resolveInvestigationBilling({
			organizationId: trigger.organizationId,
			userId: trigger.authorId,
		});
		if (billing.mode !== "fixed") {
			throw new Error(
				"Buy investigation units to start a new $1 analysis. Clarifications and verification of this investigation’s repair are included."
			);
		}
		charge = await reserveInvestigationCharge({
			billing,
			organizationId: trigger.organizationId,
			websiteId: trigger.websiteId,
			operationKey: JSON.stringify(["reply", replyId]),
		});
		if (charge.mode !== "fixed") {
			throw new Error("This operation does not have fixed investigation terms");
		}
	}
	const startedAt = new Date();
	const scope = {
		organizationId: trigger.organizationId,
		websiteId: trigger.websiteId,
		domain: trigger.websiteDomain,
	};
	// After the explicit reservation, reconcile persisted team statements before
	// current measurement. Unacknowledged writes retain the PG fallback.
	const currentScope = await business.loadCurrentBusinessScope(scope, true);
	const profile = await business
		.loadBusinessProfile({
			scope: currentScope,
			asOf: startedAt,
			allowRefresh: true,
		})
		.catch((error) => unavailableBusinessContext(error, scope, startedAt));
	const recalledAt = new Date();
	const businessContext = mergeBusinessContext(
		profile,
		await business
			.recallBusinessContext({
				scope: currentScope,
				allowWrite: true,
				asOf: recalledAt,
				subjectKey: trigger.subjectKey,
				query: `${trigger.subjectKey}\n${trigger.body}`,
			})
			.catch((error) => unavailableBusinessContext(error, scope, recalledAt))
	);
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
	if (intent === "verification") {
		const [source] = await db
			.select({
				id: insightObservations.id,
				asOf: insightObservations.asOf,
				evidence: insightObservations.evidence,
				outcome: insightObservations.outcome,
				signal: insightObservations.signal,
			})
			.from(insightObservations)
			.where(
				and(
					eq(insightObservations.organizationId, trigger.organizationId),
					eq(insightObservations.websiteId, trigger.websiteId),
					eq(insightObservations.signalKey, trigger.subjectKey),
					trigger.sourceObservationId
						? eq(insightObservations.id, trigger.sourceObservationId)
						: lte(insightObservations.createdAt, trigger.createdAt)
				)
			)
			.orderBy(
				desc(insightObservations.createdAt),
				desc(insightObservations.id)
			)
			.limit(1);
		const sourceOutcome = parseInvestigationOutcome(source?.outcome);
		const sourceSignal = parseInvestigationSignal(source?.signal);
		if (!(source && sourceOutcome && sourceSignal)) {
			throw new Error(
				"The original investigation is unavailable for verification"
			);
		}
		const existingSource = history.findIndex(
			(item) =>
				item.kind === "investigation" &&
				item.asOf === source.asOf.toISOString() &&
				isDeepStrictEqual(item.outcome, sourceOutcome) &&
				isDeepStrictEqual(item.signal, sourceSignal)
		);
		if (existingSource >= 0) {
			history.splice(existingSource, 1);
		}
		history.push({
			kind: "investigation",
			asOf: source.asOf.toISOString(),
			evidence: source.evidence,
			outcome: sourceOutcome,
			signal: sourceSignal,
		});
		if (legacyVerification) {
			await db
				.update(insightReplies)
				.set({ intent: "verification", sourceObservationId: source.id })
				.where(eq(insightReplies.id, replyId));
		}
	}
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
		...{ businessContext },
		evidence: currentMeasurement.evidence,
		githubRepository: trigger.integrations?.github ?? null,
		history,
		otherOpenWork,
		request: {
			kind: intent === "verification" ? "verification" : undefined,
			body: trigger.body,
			createdAt: trigger.createdAt.toISOString(),
		},
		signal: currentMeasurement.signal,
	}).catch((error) => {
		if (error instanceof InsightAgentExecutionError) {
			track(error);
		}
		throw error;
	});
	track(result);
	const outcome = withBusinessContextSnapshot(result.outcome, businessContext);
	const committed = await db.transaction(async (tx) => {
		await assertBusinessScopeCurrent(currentScope, tx);
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

		const next = outcome.next.type;
		const shouldUpdateInvestigation =
			current.status === "open" ||
			next === "act" ||
			next === "ask" ||
			Boolean(
				charge &&
					result.completion === "complete" &&
					result.snapshot?.completion === "complete"
			);
		if (shouldUpdateInvestigation) {
			await tx
				.update(analyticsInsights)
				.set(
					caseValues(
						{ outcome, signal: currentMeasurement.signal },
						trigger.timezone,
						committedAt
					)
				)
				.where(eq(analyticsInsights.id, current.id));
		}

		const observationId = randomUUIDv7();
		await tx.insert(insightObservations).values({
			asOf: committedAt,
			evidence: currentMeasurement.evidence,
			snapshot: result.snapshot,
			id: observationId,
			insightId: current.id,
			organizationId: trigger.organizationId,
			outcome,
			recheckAt: nextRecheckAt(committedAt, outcome.next),
			runId: null,
			signal: currentMeasurement.signal,
			signalKey: currentMeasurement.signal.signalKey,
			websiteId: trigger.websiteId,
		});
		if (charge) {
			await commitInvestigationCharge(tx, {
				chargeId: charge.id,
				observationId,
				complete:
					result.completion === "complete" &&
					result.snapshot?.completion === "complete",
			});
		}
		await tx
			.update(insightReplies)
			.set({ observationId, status: "succeeded" })
			.where(eq(insightReplies.id, replyId));
		return true;
	});

	if (committed) {
		if (charge) {
			try {
				await settleInvestigationCharge(charge.id);
			} catch (error) {
				captureInsightsError(error, "resume.billing.settlement_pending", {
					charge_id: charge.id,
					reply_id: replyId,
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
		.returning({
			slackDelivery: insightReplies.slackDelivery,
			intent: insightReplies.intent,
		});
	if (!(finalAttempt && failed)) {
		return;
	}
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
	if (failed.intent === "analysis") {
		try {
			await releaseInvestigationChargeForOperation({
				organizationId: target.organizationId,
				operationKey: JSON.stringify(["reply", replyId]),
			});
		} catch (error) {
			captureInsightsError(error, "resume.billing.release_pending", {
				organization_id: target.organizationId,
				reply_id: replyId,
			});
		}
	}
	if (!failed.slackDelivery) {
		return;
	}
	const slackDelivery = insightReplySlackDeliverySchema.parse(
		failed.slackDelivery
	);
	await deliverSlackFailure({
		clientMessageId: `${replyId}-failure`,
		context: { ...slackDelivery, ...target },
		result: null,
	});
}
