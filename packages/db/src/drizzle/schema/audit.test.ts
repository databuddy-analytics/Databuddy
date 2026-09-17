import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { auditEvents, auditOutboxEvents } from "./audit";

describe("audit event schema", () => {
	test("keeps history and the replay queue after related resources are deleted", () => {
		expect(getTableConfig(auditEvents).foreignKeys).toEqual([]);
		expect(getTableConfig(auditOutboxEvents).foreignKeys).toEqual([]);
	});
});
