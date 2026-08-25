import { describe, expect, test } from "bun:test";
import { auditActions } from "@databuddy/shared/audit";
import {
	appendAuditEventInTransaction,
	auditEventsToCsv,
	createAuditEventPayload,
	replayAuditOutbox,
	type AuditDatabase,
	type AuditEvent,
} from "./audit";

describe("appendAuditEventInTransaction", () => {
	test("redacts sensitive fields in the persisted payload", () => {
		const payload = createAuditEventPayload("org_123", {
			action: auditActions.API_KEY_CREATED,
			actor: { type: "user", id: "user_123" },
			changes: { apiKey: { after: "secret-value" } },
			metadata: { accessToken: "secret-token", label: "Production" },
			source: "orpc",
			target: { id: "key_123", displayName: "Production key" },
		});

		expect(payload.changes).toEqual({
			apiKey: { after: "[REDACTED]" },
		});
		expect(payload.metadata).toEqual({
			accessToken: "[REDACTED]",
			label: "Production",
		});
	});

	test("propagates a ledger failure so the enclosing mutation can roll back", async () => {
		const database = {
			insert: () => ({
				values: () => {
					throw new Error("audit ledger unavailable");
				},
			}),
		} as unknown as AuditDatabase;

		await expect(
			appendAuditEventInTransaction(database, "org_123", {
				action: auditActions.API_KEY_CREATED,
				actor: { type: "user", id: "user_123" },
				source: "orpc",
				target: { id: "key_123" },
			})
		).rejects.toThrow("audit ledger unavailable");
	});
});

describe("replayAuditOutbox", () => {
	const payload = {
		action: "rpc.mutation",
		actorId: "user_123",
		actorType: "user" as const,
		changes: {},
		id: "event_123",
		metadata: {},
		organizationId: "org_123",
		outcome: "success" as const,
		source: "orpc" as const,
		targetId: "org_123",
		targetType: "organization",
	};

	test("replays durable rows and reports the result", async () => {
		const operations: string[] = [];
		const database = {
			delete: () => ({
				where: async () => {
					operations.push("delete");
				},
			}),
			insert: () => ({
				values: () => ({
					onConflictDoNothing: async () => {
						operations.push("insert");
					},
				}),
			}),
			select: () => ({
				from: () => ({
					orderBy: () => ({
						limit: async () => [
							{ id: "outbox_123", payload, createdAt: new Date() },
						],
					}),
				}),
			}),
		} as unknown as AuditDatabase;

		expect(await replayAuditOutbox(database)).toEqual({ failed: 0, replayed: 1 });
		expect(operations).toEqual(["insert", "delete"]);
	});

	test("keeps failed rows visible for the next replay", async () => {
		const database = {
			delete: () => ({ where: async () => undefined }),
			insert: () => ({
				values: () => ({
					onConflictDoNothing: async () => {
						throw new Error("ledger unavailable");
					},
				}),
			}),
			select: () => ({
				from: () => ({
					orderBy: () => ({
						limit: async () => [
							{ id: "outbox_123", payload, createdAt: new Date() },
						],
					}),
				}),
			}),
		} as unknown as AuditDatabase;

		expect(await replayAuditOutbox(database)).toEqual({ failed: 1, replayed: 0 });
	});
});

describe("audit CSV export", () => {
	test("keeps investigation fields and escapes spreadsheet values", () => {
		const event = {
			id: "event_123",
			organizationId: "org_123",
			action: "api_key.deleted",
			outcome: "success",
			source: "orpc",
			operation: "apikeys.delete",
			actorType: "user",
			actorId: "user_123",
			actorDisplayName: "  =Issa, Nassar",
			targetType: "api_key",
			targetId: "key_123",
			targetDisplayName: "Production key",
			changes: {
				apiKey: { after: "secret-value" },
				deleted: { after: true },
			},
			metadata: { accessToken: "secret-token" },
			reason: null,
			requestId: "request_123",
			ip: "127.0.0.1",
			userAgent: "test-agent",
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
		} as AuditEvent;

		const csv = auditEventsToCsv([event]);

		expect(csv.split("\n")[0]).toContain("created_at");
		expect(csv).toContain('"\'  =Issa, Nassar"');
		expect(csv).toContain('"Production key"');
		expect(csv).toContain('"{""apiKey"":{""after"":""[REDACTED]""},""deleted"":{""after"":true}}"');
		expect(csv).toContain('"{""accessToken"":""[REDACTED]""}"');
	});
});
