import {
	and,
	db,
	eq,
	hasTrustedLatestInsightObservation,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	insightRunEffects,
	insightRunItems,
	type InsightRunPreparedStatus,
} from "@databuddy/db/schema";
import { randomUUIDv7 } from "bun";
import {
	deliverInsightSlackEffect,
	hasLegacyInsightSlackAnnotation,
	insightSlackEffectPayloadSchema,
	type InsightSlackEffectPayload,
} from "./delivery";
import { emitInsightsEvent } from "./lib/evlog-insights";

export const LEGACY_ANNOTATION_EFFECT_SUPPRESSION_MESSAGE =
	"suppressed: legacy annotation compatibility guard";

export interface InsightRunEffectInput {
	effectKey: string;
	payload: InsightSlackEffectPayload;
}

interface PreparedResult {
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

export function runIdentityCondition(identity: InsightRunIdentity) {
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

function preparedResult(item: {
	message: string | null;
	resultCount: number;
	status: InsightRunPreparedStatus;
}): PreparedResult {
	return {
		...(item.message ? { message: item.message } : {}),
		resultCount: item.resultCount,
		status: item.status,
	};
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
	return preparedResult({ ...item, status: item.status });
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
					inArray(insightRunEffects.status, ["pending", "failed"])
				)
			)
			.limit(1),
	]);
	if (!(item?.preparedAt && item.status) || incompleteEffect) {
		return null;
	}
	return preparedResult({
		message: item.message,
		resultCount: item.resultCount,
		status: item.status,
	});
}

export function prepareInsightRun(
	params: InsightRunIdentity & {
		effects: InsightRunEffectInput[];
		result: PreparedResult;
	}
): Promise<PreparedResult> {
	const effects = params.effects.map((effect) => ({
		...effect,
		id: randomUUIDv7(),
		payload: insightSlackEffectPayloadSchema.parse(effect.payload),
	}));
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
			return preparedResult({ ...item, status: item.status });
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

/**
 * Persist effects as soon as an individual portfolio candidate is durable.
 * This intentionally does not prepare the whole run: retries still need to
 * finish the remaining frozen candidates before the run receives a terminal
 * result.
 */
export function enqueueInsightRunEffects(
	params: InsightRunIdentity & { effects: InsightRunEffectInput[] }
): Promise<void> {
	const effects = params.effects.map((effect) => ({
		...effect,
		id: randomUUIDv7(),
		payload: insightSlackEffectPayloadSchema.parse(effect.payload),
	}));
	if (effects.length === 0) {
		return Promise.resolve();
	}
	return db.transaction(async (tx) => {
		const [item] = await tx
			.select({ id: insightRunItems.id })
			.from(insightRunItems)
			.where(runIdentityCondition(params))
			.limit(1);
		if (!item) {
			throw new Error("Insight run item not found while queuing effects");
		}
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
	});
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

async function claimEffectAttempt(
	effectId: string,
	itemId: string
): Promise<boolean> {
	const claimed = await db
		.update(insightRunEffects)
		.set({
			attempts: sql`${insightRunEffects.attempts} + 1`,
			errorMessage: null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(insightRunEffects.id, effectId),
				eq(insightRunEffects.runItemId, itemId),
				eq(insightRunEffects.status, "pending")
			)
		)
		.returning({ id: insightRunEffects.id });
	return claimed.length > 0;
}

async function suppressLegacyAnnotationEffect(
	effectId: string,
	identity: InsightRunIdentity
): Promise<boolean> {
	const skipped = await db
		.update(insightRunEffects)
		.set({
			completedAt: new Date(),
			errorMessage: LEGACY_ANNOTATION_EFFECT_SUPPRESSION_MESSAGE,
			externalId: null,
			status: "skipped",
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(insightRunEffects.id, effectId),
				eq(insightRunEffects.runItemId, identity.itemId),
				inArray(insightRunEffects.status, ["pending", "failed"])
			)
		)
		.returning({ id: insightRunEffects.id });
	if (skipped.length === 0) {
		return false;
	}
	emitInsightsEvent("warn", "delivery.slack.suppressed_legacy_annotation", {
		effect_id: effectId,
		organization_id: identity.organizationId,
		run_id: identity.runId,
		run_item_id: identity.itemId,
		website_id: identity.websiteId,
	});
	return true;
}

async function hasTrustedEffectInsight(
	identity: InsightRunIdentity,
	insightId: string
): Promise<boolean> {
	const [insight] = await db
		.select({
			isCurrentObservationTrusted:
				hasTrustedLatestInsightObservation(analyticsInsights),
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.id, insightId),
				eq(analyticsInsights.organizationId, identity.organizationId),
				eq(analyticsInsights.websiteId, identity.websiteId)
			)
		)
		.limit(1);
	return insight?.isCurrentObservationTrusted === true;
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
			effectKey: insightRunEffects.effectKey,
			id: insightRunEffects.id,
			payload: insightRunEffects.payload,
			status: insightRunEffects.status,
		})
		.from(insightRunEffects)
		.where(
			and(
				eq(insightRunEffects.runItemId, identity.itemId),
				inArray(insightRunEffects.status, ["pending", "failed"])
			)
		)
		.orderBy(insightRunEffects.createdAt, insightRunEffects.id);
	let firstError: unknown;
	for (const effect of effects) {
		let payload: InsightSlackEffectPayload;
		try {
			payload = insightSlackEffectPayloadSchema.parse(effect.payload);
			if (
				hasLegacyInsightSlackAnnotation(payload) ||
				(payload.insightId &&
					!(await hasTrustedEffectInsight(identity, payload.insightId)))
			) {
				await suppressLegacyAnnotationEffect(effect.id, identity);
				continue;
			}
		} catch (error) {
			firstError ??= error;
			try {
				if (!(await claimEffectAttempt(effect.id, identity.itemId))) {
					continue;
				}
				await recordEffectFailure(
					effect.id,
					identity.itemId,
					error,
					finalAttempt
				);
			} catch {
				// Preserve the payload error; the pending row remains retryable.
			}
			continue;
		}
		if (effect.status === "failed") {
			// Failed non-legacy effects remain terminal. Only the compatibility
			// guard above may convert one to a harmless completed state.
			continue;
		}

		try {
			if (!(await claimEffectAttempt(effect.id, identity.itemId))) {
				continue;
			}
		} catch (error) {
			firstError ??= error;
			continue;
		}

		let externalId: string | null;
		try {
			const channelId = payload.channelId ?? effect.effectKey;
			const [root] = payload.insightId
				? await db
						.select({ externalId: insightRunEffects.externalId })
						.from(insightRunEffects)
						.innerJoin(
							insightRunItems,
							eq(insightRunEffects.runItemId, insightRunItems.id)
						)
						.where(
							and(
								eq(insightRunItems.organizationId, identity.organizationId),
								eq(insightRunItems.websiteId, identity.websiteId),
								or(
									eq(insightRunEffects.effectKey, effect.effectKey),
									eq(insightRunEffects.effectKey, channelId),
									sql`${insightRunEffects.payload}->>'channelId' = ${channelId}`
								),
								eq(insightRunEffects.status, "succeeded"),
								isNotNull(insightRunEffects.externalId),
								or(
									sql`${insightRunEffects.payload}->>'insightId' = ${payload.insightId}`,
									and(
										eq(insightRunEffects.effectKey, channelId),
										sql`${insightRunEffects.payload}->>'insightId' is null`
									)
								)
							)
						)
						.orderBy(insightRunEffects.createdAt, insightRunEffects.id)
						.limit(1)
				: [];
			externalId = await (handlers.slack ?? deliverInsightSlackEffect)(
				payload,
				{
					channelId,
					organizationId: identity.organizationId,
					websiteId: identity.websiteId,
				},
				effect.id,
				root?.externalId ?? undefined
			);
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

interface InsightEffectHandlers {
	slack?: typeof deliverInsightSlackEffect;
}
