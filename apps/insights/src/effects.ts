import { and, db, eq, inArray, isNull, ne, sql } from "@databuddy/db";
import {
	insightObservations,
	insightRunEffects,
	insightRunItems,
	type InsightRunPreparedStatus,
} from "@databuddy/db/schema";
import type {
	InvestigationDecision,
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import {
	deliverInsightSlackEffect,
	type InsightSlackEffectPayload,
} from "./delivery";

const slackBlockSchema = z
	.object({
		accessory: z.unknown().optional(),
		elements: z.array(z.unknown()).optional(),
		text: z
			.object({
				emoji: z.boolean().optional(),
				text: z.string(),
				type: z.string(),
			})
			.strict()
			.optional(),
		type: z.string(),
	})
	.strict();

const insightSlackEffectPayloadSchema = z
	.object({
		blocks: z.array(slackBlockSchema).max(50),
		channelId: z.string().min(1),
		organizationId: z.string().min(1),
		text: z.string().min(1),
		websiteId: z.string().min(1),
	})
	.strict();

export interface InsightRunEffectInput {
	effectKey: string;
	payload: InsightSlackEffectPayload;
}

interface ObservationInput {
	asOf: Date;
	decision: InvestigationDecision;
	evidence: InvestigationEvidence[];
	insightId: string | null;
	recheckAt: Date;
	signal: InvestigationSignal;
}

export interface PreparedResult {
	insightIds: string[];
	message?: string;
	resultCount: number;
	status: InsightRunPreparedStatus;
}

export interface InsightRunIdentity {
	itemId: string;
	organizationId: string;
	queueJobId: string | null;
	runId: string;
	websiteId: string;
}

function runIdentityCondition(identity: InsightRunIdentity) {
	return and(
		eq(insightRunItems.id, identity.itemId),
		eq(insightRunItems.runId, identity.runId),
		eq(insightRunItems.organizationId, identity.organizationId),
		eq(insightRunItems.websiteId, identity.websiteId),
		identity.queueJobId === null
			? isNull(insightRunItems.queueJobId)
			: eq(insightRunItems.queueJobId, identity.queueJobId)
	);
}

function preparedResult(
	item: {
		message: string | null;
		resultCount: number;
		status: InsightRunPreparedStatus;
	},
	insightId: string | null | undefined
): PreparedResult {
	return {
		insightIds: insightId ? [insightId] : [],
		...(item.message ? { message: item.message } : {}),
		resultCount: item.resultCount,
		status: item.status,
	};
}

function parseEffectPayload(payload: unknown): InsightSlackEffectPayload {
	return insightSlackEffectPayloadSchema.parse(payload);
}

export async function loadPreparedInsightRun(
	identity: InsightRunIdentity
): Promise<PreparedResult | null> {
	const [item] = await db
		.select({
			message: insightRunItems.preparedMessage,
			preparedAt: insightRunItems.preparedAt,
			resultCount: insightRunItems.resultCount,
			status: insightRunItems.preparedStatus,
		})
		.from(insightRunItems)
		.where(runIdentityCondition(identity))
		.limit(1);
	if (!(item?.preparedAt && item.status)) {
		return null;
	}
	const [observation] = await db
		.select({ insightId: insightObservations.insightId })
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.runId, identity.runId),
				eq(insightObservations.organizationId, identity.organizationId),
				eq(insightObservations.websiteId, identity.websiteId)
			)
		)
		.limit(1);
	return preparedResult(
		{ ...item, status: item.status },
		observation?.insightId
	);
}

export async function loadCompletedPreparedResult(
	identity: InsightRunIdentity | string
): Promise<PreparedResult | null> {
	const itemId = typeof identity === "string" ? identity : identity.itemId;
	const [[item], [incompleteEffect]] = await Promise.all([
		db
			.select({
				message: insightRunItems.preparedMessage,
				preparedAt: insightRunItems.preparedAt,
				resultCount: insightRunItems.resultCount,
				status: insightRunItems.preparedStatus,
			})
			.from(insightRunItems)
			.where(
				typeof identity === "string"
					? eq(insightRunItems.id, itemId)
					: runIdentityCondition(identity)
			)
			.limit(1),
		db
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(
				and(
					eq(insightRunEffects.runItemId, itemId),
					ne(insightRunEffects.status, "succeeded")
				)
			)
			.limit(1),
	]);
	if (!(item?.preparedAt && item.status) || incompleteEffect) {
		return null;
	}
	return preparedResult(
		{
			message: item.message,
			resultCount: item.resultCount,
			status: item.status,
		},
		null
	);
}

export function prepareInsightRun(
	params: InsightRunIdentity & {
		effects: InsightRunEffectInput[];
		observation?: ObservationInput;
		result: PreparedResult;
	}
): Promise<PreparedResult> {
	const effects = params.effects.map((effect) => {
		const payload = parseEffectPayload(effect.payload);
		if (
			payload.organizationId !== params.organizationId ||
			payload.websiteId !== params.websiteId
		) {
			throw new Error("Insight effect identity does not match its run item");
		}
		return { ...effect, id: randomUUIDv7(), payload };
	});
	return db.transaction(async (tx) => {
		const [item] = await tx
			.select({
				message: insightRunItems.preparedMessage,
				preparedAt: insightRunItems.preparedAt,
				resultCount: insightRunItems.resultCount,
				status: insightRunItems.preparedStatus,
			})
			.from(insightRunItems)
			.where(runIdentityCondition(params))
			.limit(1)
			.for("update");
		if (!item) {
			throw new Error("Insight run item not found while preparing effects");
		}
		if (item.preparedAt) {
			if (!item.status) {
				throw new Error("Prepared insight run item is missing its result");
			}
			const [observation] = await tx
				.select({ insightId: insightObservations.insightId })
				.from(insightObservations)
				.where(
					and(
						eq(insightObservations.runId, params.runId),
						eq(insightObservations.organizationId, params.organizationId),
						eq(insightObservations.websiteId, params.websiteId)
					)
				)
				.limit(1);
			return preparedResult(
				{ ...item, status: item.status },
				observation?.insightId
			);
		}
		if (params.observation) {
			await tx
				.insert(insightObservations)
				.values({
					id: randomUUIDv7(),
					runId: params.runId,
					organizationId: params.organizationId,
					websiteId: params.websiteId,
					insightId: params.observation.insightId,
					signalKey: params.observation.signal.signalKey,
					asOf: params.observation.asOf,
					disposition: params.observation.decision.disposition,
					signal: params.observation.signal,
					evidence: params.observation.evidence,
					decision: params.observation.decision,
					recheckAt: params.observation.recheckAt,
				})
				.onConflictDoNothing({
					target: [insightObservations.runId, insightObservations.websiteId],
				});
		}
		if (effects.length > 0) {
			await tx
				.insert(insightRunEffects)
				.values(
					effects.map((effect) => ({
						id: effect.id,
						runItemId: params.itemId,
						effectKey: effect.effectKey,
						payload: effect.payload,
					}))
				)
				.onConflictDoNothing({
					target: [insightRunEffects.runItemId, insightRunEffects.effectKey],
				});
		}
		await tx
			.update(insightRunItems)
			.set({
				preparedAt: new Date(),
				preparedMessage: params.result.message ?? null,
				preparedStatus: params.result.status,
				resultCount: params.result.resultCount,
				updatedAt: new Date(),
			})
			.where(
				and(runIdentityCondition(params), isNull(insightRunItems.preparedAt))
			);
		return params.result;
	});
}

function executeEffect(
	effect: {
		id: string;
		payload: unknown;
	},
	handlers: InsightEffectHandlers
): Promise<string | null> {
	const payload = parseEffectPayload(effect.payload);
	return (handlers.slack ?? deliverInsightSlackEffect)(payload, effect.id);
}

function errorMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

const SUCCESS_CHECKPOINT_ATTEMPTS = 3;

async function checkpointEffectSuccess(
	effectId: string,
	itemId: string,
	externalId: string | null
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < SUCCESS_CHECKPOINT_ATTEMPTS; attempt += 1) {
		try {
			await db
				.update(insightRunEffects)
				.set({
					completedAt: new Date(),
					errorMessage: null,
					externalId,
					status: "succeeded",
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(insightRunEffects.id, effectId),
						eq(insightRunEffects.runItemId, itemId),
						inArray(insightRunEffects.status, ["pending", "failed"])
					)
				);
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

async function recordEffectFailure(
	effectId: string,
	itemId: string,
	error: unknown,
	finalAttempt: boolean
): Promise<void> {
	await db
		.update(insightRunEffects)
		.set({
			errorMessage: errorMessage(error),
			status: finalAttempt ? "failed" : "pending",
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(insightRunEffects.id, effectId),
				eq(insightRunEffects.runItemId, itemId),
				eq(insightRunEffects.status, "pending")
			)
		);
}

export async function drainInsightRunEffects(
	identity: InsightRunIdentity,
	finalAttempt: boolean,
	handlers: InsightEffectHandlers = {}
): Promise<void> {
	const [item] = await db
		.select({ id: insightRunItems.id })
		.from(insightRunItems)
		.where(runIdentityCondition(identity))
		.limit(1);
	if (!item) {
		throw new Error("Insight run item identity does not match effect drain");
	}
	const effects = await db
		.select({
			id: insightRunEffects.id,
			payload: insightRunEffects.payload,
		})
		.from(insightRunEffects)
		.where(
			and(
				eq(insightRunEffects.runItemId, identity.itemId),
				eq(insightRunEffects.status, "pending")
			)
		)
		.orderBy(insightRunEffects.createdAt, insightRunEffects.id);
	let firstError: unknown;
	for (const effect of effects) {
		try {
			const claimed = await db
				.update(insightRunEffects)
				.set({
					attempts: sql`${insightRunEffects.attempts} + 1`,
					errorMessage: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(insightRunEffects.id, effect.id),
						eq(insightRunEffects.runItemId, identity.itemId),
						eq(insightRunEffects.status, "pending")
					)
				)
				.returning({ id: insightRunEffects.id });
			if (claimed.length === 0) {
				continue;
			}
		} catch (error) {
			firstError ??= error;
			continue;
		}

		let externalId: string | null;
		try {
			externalId = await executeEffect(effect, handlers);
		} catch (error) {
			firstError ??= error;
			try {
				await recordEffectFailure(
					effect.id,
					identity.itemId,
					error,
					finalAttempt
				);
			} catch {
				// Preserve the provider error; the pending row remains retryable.
			}
			continue;
		}

		try {
			await checkpointEffectSuccess(effect.id, identity.itemId, externalId);
		} catch (error) {
			firstError ??= error;
		}
	}
	const unresolved = await db
		.select({ status: insightRunEffects.status })
		.from(insightRunEffects)
		.where(
			and(
				eq(insightRunEffects.runItemId, identity.itemId),
				inArray(insightRunEffects.status, ["pending", "failed"])
			)
		)
		.limit(1);
	if (unresolved.length === 0) {
		return;
	}
	if (firstError) {
		throw firstError;
	}
	throw new Error(
		unresolved[0]?.status === "failed"
			? "Insight run has a failed external effect"
			: "Insight run still has a pending external effect"
	);
}

export interface InsightEffectHandlers {
	slack?: (
		payload: InsightSlackEffectPayload,
		clientMessageId: string
	) => Promise<string | null>;
}
