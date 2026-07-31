import { describe, expect, test } from "bun:test";
import { auditActions } from "@databuddy/shared/audit";
import {
	appendAuditEventInTransaction,
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
