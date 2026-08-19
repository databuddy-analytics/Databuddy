import { describe, expect, test } from "bun:test";
import { auditActions } from "@databuddy/shared/audit";
import {
	appendAuditEventInTransaction,
	replayAuditOutbox,
	type AuditDatabase,
} from "./audit";

describe("appendAuditEventInTransaction", () => {
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
