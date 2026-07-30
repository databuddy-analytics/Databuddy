import { randomUUID } from "node:crypto";
import {
	and,
	asc,
	desc,
	eq,
	lt,
	or,
	type InferSelectModel,
} from "@databuddy/db";
import {
	auditEvents,
	auditOutboxEvents,
	type AuditOutboxPayload,
} from "@databuddy/db/schema";
import { emitAuditMirror } from "@databuddy/shared/audit";
import type {
	AuditActionDefinition,
	AuditActor,
	AuditChanges,
	AuditMetadata,
	AuditOutcome,
	AuditRequestContext,
	AuditSource,
} from "@databuddy/shared/audit";

export type AuditDatabase = Pick<
	typeof import("@databuddy/db").db,
	"delete" | "insert" | "select"
>;

export type AuditEvent = InferSelectModel<typeof auditEvents>;

export interface AuditTarget {
	displayName?: string;
	id: string;
}

export interface AppendAuditEventInput<TAction extends AuditActionDefinition> {
	action: TAction;
	actor: AuditActor;
	changes?: AuditChanges;
	metadata?: AuditMetadata;
	operation?: string;
	outcome?: AuditOutcome;
	reason?: string;
	request?: AuditRequestContext;
	source: AuditSource;
	target: AuditTarget;
}

export function createAuditEventPayload<TAction extends AuditActionDefinition>(
	organizationId: string,
	input: AppendAuditEventInput<TAction>
): AuditOutboxPayload {
	return {
		action: input.action.action,
		actorDisplayName: input.actor.displayName,
		actorId: input.actor.id,
		actorType: input.actor.type,
		changes: input.changes ?? {},
		id: randomUUID(),
		ip: input.request?.ip,
		metadata: input.metadata ?? {},
		operation: input.operation,
		organizationId,
		outcome: input.outcome ?? "success",
		reason: input.reason,
		requestId: input.request?.requestId,
		source: input.source,
		targetDisplayName: input.target.displayName,
		targetId: input.target.id,
		targetType: input.action.targetType,
		userAgent: input.request?.userAgent,
	};
}

async function insertAuditPayload(
	database: AuditDatabase,
	payload: AuditOutboxPayload
): Promise<AuditEvent> {
	const [event] = await database
		.insert(auditEvents)
		.values(payload)
		.returning();
	if (!event) {
		throw new Error("Audit event was not persisted");
	}
	return event;
}

/**
 * Persists an audit event with the caller's database transaction. It never
 * falls back to the outbox: callers use it when the audited mutation must roll
 * back if the ledger cannot be written.
 */
export function appendAuditEventInTransaction<
	TAction extends AuditActionDefinition,
>(
	database: AuditDatabase,
	organizationId: string,
	input: AppendAuditEventInput<TAction>
): Promise<AuditEvent> {
	return insertAuditPayload(
		database,
		createAuditEventPayload(organizationId, input)
	);
}

/** Replays a bounded batch of previously durable audit writes. */
export async function replayAuditOutbox(
	database: AuditDatabase,
	limit = 100
): Promise<number> {
	const rows = await database
		.select()
		.from(auditOutboxEvents)
		.orderBy(asc(auditOutboxEvents.createdAt))
		.limit(Math.min(Math.max(limit, 1), 100));
	let replayed = 0;
	for (const row of rows) {
		try {
			await database
				.insert(auditEvents)
				.values(row.payload)
				.onConflictDoNothing({ target: auditEvents.id });
			await database
				.delete(auditOutboxEvents)
				.where(eq(auditOutboxEvents.id, row.id));
			replayed += 1;
		} catch {
			// Leave the durable entry for the next bounded replay attempt.
		}
	}
	return replayed;
}

export async function appendAuditEvent<TAction extends AuditActionDefinition>(
	database: AuditDatabase,
	organizationId: string,
	input: AppendAuditEventInput<TAction>
): Promise<AuditEvent> {
	const payload = createAuditEventPayload(organizationId, input);
	let event: AuditEvent;
	try {
		event = await insertAuditPayload(database, payload);
	} catch {
		await database
			.insert(auditOutboxEvents)
			.values({ id: payload.id, payload })
			.onConflictDoNothing({ target: auditOutboxEvents.id });
		return {
			...payload,
			actorDisplayName: payload.actorDisplayName ?? null,
			createdAt: new Date(),
			ip: payload.ip ?? null,
			operation: payload.operation ?? null,
			reason: payload.reason ?? null,
			requestId: payload.requestId ?? null,
			targetDisplayName: payload.targetDisplayName ?? null,
			userAgent: payload.userAgent ?? null,
		};
	}

	// The ledger is authoritative. This mirror keeps audit activity visible in
	// the established evlog pipeline without making product queries depend on it.
	emitAuditMirror({
		action: input.action,
		actor: input.actor,
		changes: input.changes,
		correlationId: input.request?.requestId,
		organizationId,
		outcome: input.outcome,
		reason: input.reason,
		target: { id: input.target.id },
	});

	replayAuditOutbox(database).catch(() => undefined);

	return event;
}

export interface AuditCursor {
	createdAt: Date;
	id: string;
}

export function encodeAuditCursor(event: Pick<AuditEvent, "createdAt" | "id">) {
	return Buffer.from(
		JSON.stringify({ createdAt: event.createdAt.toISOString(), id: event.id })
	).toString("base64url");
}

export function decodeAuditCursor(cursor: string): AuditCursor | null {
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8")
		);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("createdAt" in parsed) ||
			!("id" in parsed) ||
			typeof parsed.createdAt !== "string" ||
			typeof parsed.id !== "string"
		) {
			return null;
		}

		const createdAt = new Date(parsed.createdAt);
		if (Number.isNaN(createdAt.getTime())) {
			return null;
		}

		return { createdAt, id: parsed.id };
	} catch {
		return null;
	}
}

export interface ListAuditEventsInput {
	action?: string;
	actorId?: string;
	cursor?: AuditCursor;
	limit: number;
	organizationId: string;
	outcome?: AuditOutcome;
	targetId?: string;
}

export async function listAuditEvents(
	database: AuditDatabase,
	input: ListAuditEventsInput
): Promise<AuditEvent[]> {
	const conditions = [eq(auditEvents.organizationId, input.organizationId)];

	if (input.action) {
		conditions.push(eq(auditEvents.action, input.action));
	}
	if (input.actorId) {
		conditions.push(eq(auditEvents.actorId, input.actorId));
	}
	if (input.outcome) {
		conditions.push(eq(auditEvents.outcome, input.outcome));
	}
	if (input.targetId) {
		conditions.push(eq(auditEvents.targetId, input.targetId));
	}
	if (input.cursor) {
		const cursorCondition = or(
			lt(auditEvents.createdAt, input.cursor.createdAt),
			and(
				eq(auditEvents.createdAt, input.cursor.createdAt),
				lt(auditEvents.id, input.cursor.id)
			)
		);
		if (cursorCondition) {
			conditions.push(cursorCondition);
		}
	}

	return await database
		.select()
		.from(auditEvents)
		.where(and(...conditions))
		.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
		.limit(input.limit + 1);
}

export async function getAuditEvent(
	database: AuditDatabase,
	organizationId: string,
	id: string
): Promise<AuditEvent | null> {
	const [event] = await database
		.select()
		.from(auditEvents)
		.where(
			and(
				eq(auditEvents.organizationId, organizationId),
				eq(auditEvents.id, id)
			)
		)
		.limit(1);

	return event ?? null;
}
