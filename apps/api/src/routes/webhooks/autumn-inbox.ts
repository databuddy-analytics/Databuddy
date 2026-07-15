import { randomUUID } from "node:crypto";
import {
	and,
	asc,
	db,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "@databuddy/db";
import {
	autumnWebhookEvents,
	type AutumnWebhookStatus,
} from "@databuddy/db/schema";

const MAX_ERROR_LENGTH = 500;
const MAX_MAINTENANCE_BATCH = 100;
const COMPLETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEAD_LETTER_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

export const AUTUMN_WEBHOOK_LEASE_MS = 5 * 60 * 1000;
export const AUTUMN_WEBHOOK_MAX_ATTEMPTS = 12;

export interface StoredAutumnWebhook {
	id: string;
	payload: Record<string, unknown>;
	status: AutumnWebhookStatus;
	type: string;
}

export interface ClaimedAutumnWebhook extends StoredAutumnWebhook {
	attempts: number;
	claimToken: string;
}

export interface AutumnWebhookDeadLetter {
	attempts: number;
	deadLetteredAt: Date;
	errorMessage: string | null;
	id: string;
	type: string;
}

type AttemptStatus = "completed" | "deferred" | "pending";

function batchLimit(value: number | undefined): number {
	return Math.min(
		Math.max(value ?? MAX_MAINTENANCE_BATCH, 1),
		MAX_MAINTENANCE_BATCH
	);
}

export function autumnWebhookRetryDelayMs(attempts: number): number {
	return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_MAX_MS);
}

export async function storeAutumnWebhook(input: {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}): Promise<StoredAutumnWebhook> {
	await db
		.insert(autumnWebhookEvents)
		.values({
			id: input.id,
			type: input.type,
			payload: input.payload,
		})
		.onConflictDoNothing({ target: autumnWebhookEvents.id });

	const stored = await getAutumnWebhook(input.id);
	if (!stored) {
		throw new Error("Autumn webhook was not persisted");
	}
	return stored;
}

export async function getAutumnWebhook(
	id: string
): Promise<StoredAutumnWebhook | null> {
	const [row] = await db
		.select({
			id: autumnWebhookEvents.id,
			payload: autumnWebhookEvents.payload,
			status: autumnWebhookEvents.status,
			type: autumnWebhookEvents.type,
		})
		.from(autumnWebhookEvents)
		.where(eq(autumnWebhookEvents.id, id))
		.limit(1);
	return row ?? null;
}

export async function claimAutumnWebhook(input: {
	id: string;
	leaseMs?: number;
	now?: Date;
}): Promise<ClaimedAutumnWebhook | null> {
	const now = input.now ?? new Date();
	const claimToken = randomUUID();
	const leaseExpiresAt = new Date(
		now.getTime() + (input.leaseMs ?? AUTUMN_WEBHOOK_LEASE_MS)
	);
	const [row] = await db
		.update(autumnWebhookEvents)
		.set({
			attempts: sql`${autumnWebhookEvents.attempts} + 1`,
			leaseExpiresAt,
			leaseToken: claimToken,
			nextAttemptAt: null,
			status: "processing",
			updatedAt: now,
		})
		.where(
			and(
				eq(autumnWebhookEvents.id, input.id),
				lt(autumnWebhookEvents.attempts, AUTUMN_WEBHOOK_MAX_ATTEMPTS),
				or(
					and(
						inArray(autumnWebhookEvents.status, ["pending", "deferred"]),
						or(
							isNull(autumnWebhookEvents.nextAttemptAt),
							lte(autumnWebhookEvents.nextAttemptAt, now)
						)
					),
					and(
						eq(autumnWebhookEvents.status, "processing"),
						or(
							isNull(autumnWebhookEvents.leaseExpiresAt),
							lte(autumnWebhookEvents.leaseExpiresAt, now)
						)
					)
				)
			)
		)
		.returning({
			attempts: autumnWebhookEvents.attempts,
			id: autumnWebhookEvents.id,
			payload: autumnWebhookEvents.payload,
			status: autumnWebhookEvents.status,
			type: autumnWebhookEvents.type,
		});
	return row ? { ...row, claimToken } : null;
}

export async function recordAutumnWebhookAttempt(input: {
	attempts: number;
	claimToken: string;
	errorMessage?: string;
	id: string;
	now?: Date;
	status: AttemptStatus;
}): Promise<AutumnWebhookStatus> {
	const now = input.now ?? new Date();
	if (input.status === "completed") {
		const [completed] = await db
			.update(autumnWebhookEvents)
			.set({
				alertedAt: null,
				completedAt: now,
				deadLetteredAt: null,
				errorMessage: null,
				leaseExpiresAt: null,
				leaseToken: null,
				nextAttemptAt: null,
				status: "completed",
				updatedAt: now,
			})
			.where(
				and(
					eq(autumnWebhookEvents.id, input.id),
					eq(autumnWebhookEvents.leaseToken, input.claimToken),
					eq(autumnWebhookEvents.status, "processing")
				)
			)
			.returning({ status: autumnWebhookEvents.status });
		if (completed) {
			return completed.status;
		}
	} else {
		const deadLetter = input.attempts >= AUTUMN_WEBHOOK_MAX_ATTEMPTS;
		const status = deadLetter ? "dead_letter" : input.status;
		const [retry] = await db
			.update(autumnWebhookEvents)
			.set({
				completedAt: null,
				deadLetteredAt: deadLetter ? now : null,
				errorMessage: input.errorMessage?.slice(0, MAX_ERROR_LENGTH) ?? null,
				leaseExpiresAt: null,
				leaseToken: null,
				nextAttemptAt: deadLetter
					? null
					: new Date(now.getTime() + autumnWebhookRetryDelayMs(input.attempts)),
				status,
				updatedAt: now,
			})
			.where(
				and(
					eq(autumnWebhookEvents.id, input.id),
					eq(autumnWebhookEvents.status, "processing"),
					eq(autumnWebhookEvents.leaseToken, input.claimToken)
				)
			)
			.returning({ status: autumnWebhookEvents.status });
		if (retry) {
			return retry.status;
		}
	}

	const stored = await getAutumnWebhook(input.id);
	if (!stored) {
		throw new Error("Autumn webhook disappeared before status update");
	}
	return stored.status;
}

export async function deadLetterExhaustedAutumnWebhooks(
	now = new Date()
): Promise<number> {
	const rows = await db
		.update(autumnWebhookEvents)
		.set({
			alertedAt: null,
			deadLetteredAt: now,
			errorMessage: "Maximum replay attempts exhausted",
			leaseExpiresAt: null,
			leaseToken: null,
			nextAttemptAt: null,
			status: "dead_letter",
			updatedAt: now,
		})
		.where(
			and(
				gte(autumnWebhookEvents.attempts, AUTUMN_WEBHOOK_MAX_ATTEMPTS),
				or(
					inArray(autumnWebhookEvents.status, ["pending", "deferred"]),
					and(
						eq(autumnWebhookEvents.status, "processing"),
						or(
							isNull(autumnWebhookEvents.leaseExpiresAt),
							lte(autumnWebhookEvents.leaseExpiresAt, now)
						)
					)
				)
			)
		)
		.returning({ id: autumnWebhookEvents.id });
	return rows.length;
}

export async function listReplayableAutumnWebhookIds(input?: {
	limit?: number;
	now?: Date;
}): Promise<string[]> {
	const now = input?.now ?? new Date();
	const rows = await db
		.select({ id: autumnWebhookEvents.id })
		.from(autumnWebhookEvents)
		.where(
			and(
				lt(autumnWebhookEvents.attempts, AUTUMN_WEBHOOK_MAX_ATTEMPTS),
				or(
					and(
						inArray(autumnWebhookEvents.status, ["pending", "deferred"]),
						or(
							isNull(autumnWebhookEvents.nextAttemptAt),
							lte(autumnWebhookEvents.nextAttemptAt, now)
						)
					),
					and(
						eq(autumnWebhookEvents.status, "processing"),
						or(
							isNull(autumnWebhookEvents.leaseExpiresAt),
							lte(autumnWebhookEvents.leaseExpiresAt, now)
						)
					)
				)
			)
		)
		.orderBy(asc(autumnWebhookEvents.updatedAt))
		.limit(batchLimit(input?.limit));
	return rows.map((row) => row.id);
}

export async function listUnalertedAutumnWebhookDeadLetters(input?: {
	limit?: number;
}): Promise<AutumnWebhookDeadLetter[]> {
	const rows = await db
		.select({
			attempts: autumnWebhookEvents.attempts,
			deadLetteredAt: autumnWebhookEvents.deadLetteredAt,
			errorMessage: autumnWebhookEvents.errorMessage,
			id: autumnWebhookEvents.id,
			type: autumnWebhookEvents.type,
		})
		.from(autumnWebhookEvents)
		.where(
			and(
				eq(autumnWebhookEvents.status, "dead_letter"),
				isNull(autumnWebhookEvents.alertedAt),
				isNotNull(autumnWebhookEvents.deadLetteredAt)
			)
		)
		.orderBy(asc(autumnWebhookEvents.deadLetteredAt))
		.limit(batchLimit(input?.limit));
	return rows.filter(
		(row): row is AutumnWebhookDeadLetter => row.deadLetteredAt !== null
	);
}

export async function markAutumnWebhookDeadLettersAlerted(
	ids: string[],
	now = new Date()
): Promise<number> {
	if (ids.length === 0) {
		return 0;
	}
	const rows = await db
		.update(autumnWebhookEvents)
		.set({ alertedAt: now, updatedAt: now })
		.where(
			and(
				inArray(autumnWebhookEvents.id, ids),
				eq(autumnWebhookEvents.status, "dead_letter"),
				isNull(autumnWebhookEvents.alertedAt)
			)
		)
		.returning({ id: autumnWebhookEvents.id });
	return rows.length;
}

export async function deleteCompletedAutumnWebhooks(input?: {
	limit?: number;
	olderThan?: Date;
}): Promise<number> {
	const olderThan =
		input?.olderThan ?? new Date(Date.now() - COMPLETED_RETENTION_MS);
	const rows = await db
		.select({ id: autumnWebhookEvents.id })
		.from(autumnWebhookEvents)
		.where(
			and(
				eq(autumnWebhookEvents.status, "completed"),
				lt(autumnWebhookEvents.completedAt, olderThan)
			)
		)
		.orderBy(asc(autumnWebhookEvents.completedAt))
		.limit(batchLimit(input?.limit));
	if (rows.length === 0) {
		return 0;
	}
	const deleted = await db
		.delete(autumnWebhookEvents)
		.where(
			and(
				inArray(
					autumnWebhookEvents.id,
					rows.map((row) => row.id)
				),
				eq(autumnWebhookEvents.status, "completed"),
				lt(autumnWebhookEvents.completedAt, olderThan)
			)
		)
		.returning({ id: autumnWebhookEvents.id });
	return deleted.length;
}

export async function deleteDeadLetterAutumnWebhooks(input?: {
	limit?: number;
	olderThan?: Date;
}): Promise<number> {
	const olderThan =
		input?.olderThan ?? new Date(Date.now() - DEAD_LETTER_RETENTION_MS);
	const rows = await db
		.select({ id: autumnWebhookEvents.id })
		.from(autumnWebhookEvents)
		.where(
			and(
				eq(autumnWebhookEvents.status, "dead_letter"),
				isNotNull(autumnWebhookEvents.alertedAt),
				lt(autumnWebhookEvents.deadLetteredAt, olderThan)
			)
		)
		.orderBy(asc(autumnWebhookEvents.deadLetteredAt))
		.limit(batchLimit(input?.limit));
	if (rows.length === 0) {
		return 0;
	}
	const deleted = await db
		.delete(autumnWebhookEvents)
		.where(
			and(
				inArray(
					autumnWebhookEvents.id,
					rows.map((row) => row.id)
				),
				eq(autumnWebhookEvents.status, "dead_letter"),
				isNotNull(autumnWebhookEvents.alertedAt),
				lt(autumnWebhookEvents.deadLetteredAt, olderThan)
			)
		)
		.returning({ id: autumnWebhookEvents.id });
	return deleted.length;
}
