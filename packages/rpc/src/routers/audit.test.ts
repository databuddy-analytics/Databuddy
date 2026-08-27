import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuditEvent } from "@databuddy/services/audit";
import { createProcedureClient } from "@orpc/server";
import type { Context } from "../orpc";

process.env.REDIS_URL ??= "redis://localhost:6379";

const ORGANIZATION_ID = "org-audit";
const USER_ID = "user-audit";

type ListAuditEventsInput = Parameters<
	typeof import("@databuddy/services/audit").listAuditEvents
>[1];

const listCalls: ListAuditEventsInput[] = [];
let pages: AuditEvent[][] = [];
let repeatingPage: AuditEvent[] | null = null;
let rateLimitSuccess = true;

const mockListAuditEvents = mock(async (_db: unknown, input: unknown) => {
	listCalls.push(input as ListAuditEventsInput);
	if (repeatingPage) {
		return repeatingPage;
	}
	return pages.shift() ?? [];
});
const mockAppendAudit = mock(async () => undefined);
const mockWithWorkspace = mock(async () => ({
	organizationId: ORGANIZATION_ID,
	role: "owner",
}));
const mockRatelimit = mock(async () => ({
	limit: 5,
	remaining: 4,
	reset: Date.now() + 60_000,
	success: rateLimitSuccess,
}));

let auditRouter: typeof import("./audit").auditRouter;
let takeAuditExportPage: typeof import("./audit").takeAuditExportPage;
let encodeAuditCursor: typeof import("@databuddy/services/audit").encodeAuditCursor;

beforeAll(async () => {
	const realAudit = await import("@databuddy/services/audit");
	const realAuditLib = await import("../lib/audit");
	encodeAuditCursor = realAudit.encodeAuditCursor;

	mock.module("@databuddy/services/audit", () => ({
		...realAudit,
		listAuditEvents: mockListAuditEvents,
	}));
	mock.module("@databuddy/redis/rate-limit", () => ({
		ratelimit: mockRatelimit,
	}));
	mock.module("../procedures/with-workspace", () => ({
		withWorkspace: mockWithWorkspace,
	}));
	mock.module("../lib/audit", () => ({
		...realAuditLib,
		appendRpcAuditEventBestEffort: mockAppendAudit,
	}));

	({ auditRouter, takeAuditExportPage } = await import("./audit"));

	mock.restore();
});

beforeEach(() => {
	listCalls.length = 0;
	pages = [];
	repeatingPage = null;
	rateLimitSuccess = true;
	mockListAuditEvents.mockClear();
	mockAppendAudit.mockClear();
	mockWithWorkspace.mockClear();
	mockRatelimit.mockClear();
});

function sessionContext(): Context {
	return {
		db: {},
		organizationId: ORGANIZATION_ID,
		session: { activeOrganizationId: ORGANIZATION_ID },
		user: { email: "owner@example.com", id: USER_ID, name: "Owner" },
	} as Context;
}

function call<T>(procedure: T) {
	return createProcedureClient(procedure as never, {
		context: sessionContext(),
	});
}

function auditEvent(index: number): AuditEvent {
	return {
		action: "team.member_added",
		actorDisplayName: null,
		actorId: USER_ID,
		actorType: "user",
		changes: {},
		createdAt: new Date(Date.UTC(2026, 0, 1) - index * 1000),
		id: `event-${String(index).padStart(6, "0")}`,
		ip: null,
		metadata: {},
		operation: null,
		organizationId: ORGANIZATION_ID,
		outcome: "success",
		reason: null,
		requestId: null,
		source: "orpc",
		targetDisplayName: null,
		targetId: "member-1",
		targetType: "member",
		userAgent: null,
	};
}

function eventPage(startIndex: number, count: number): AuditEvent[] {
	return Array.from({ length: count }, (_, offset) =>
		auditEvent(startIndex + offset)
	);
}

function cursorOf(event: AuditEvent) {
	return { createdAt: event.createdAt, id: event.id };
}

describe("takeAuditExportPage", () => {
	test("returns an empty final page for an empty result set", () => {
		expect(takeAuditExportPage([], [])).toEqual({
			hasMore: false,
			page: [],
			truncated: false,
		});
	});

	test("passes a single page under the limit through untouched", () => {
		const rows = [1, 2, 3];

		expect(takeAuditExportPage([], rows)).toEqual({
			hasMore: false,
			page: rows,
			truncated: false,
		});
	});

	test("caps a page at the page size and signals more rows", () => {
		const rows = Array.from({ length: 101 }, (_, index) => index);

		const result = takeAuditExportPage([], rows);

		expect(result.page).toHaveLength(100);
		expect(result.hasMore).toBe(true);
		expect(result.truncated).toBe(false);
	});

	test("caps a final page at 10,000 rows and marks the export truncated", () => {
		const currentEvents = Array.from({ length: 9_998 }, (_, index) => index);
		const rows = Array.from({ length: 101 }, (_, index) => index);

		const result = takeAuditExportPage(currentEvents, rows);

		expect(result.page).toEqual([0, 1]);
		expect(result.hasMore).toBe(true);
		expect(result.truncated).toBe(true);
	});

	test("does not mark an exact-cap export as truncated", () => {
		const currentEvents = Array.from({ length: 9_998 }, (_, index) => index);
		const rows = [0, 1];

		const result = takeAuditExportPage(currentEvents, rows);

		expect(result.page).toEqual(rows);
		expect(result.hasMore).toBe(false);
		expect(result.truncated).toBe(false);
	});
});

describe("audit.export paging", () => {
	test("exports an empty organization as a header-only CSV", async () => {
		pages = [[]];

		const result = await call(auditRouter.export)({ includeTechnical: false });

		expect(result.rowCount).toBe(0);
		expect(result.truncated).toBe(false);
		expect(result.content.trim().split("\n")).toHaveLength(1);
		expect(listCalls).toHaveLength(1);
		expect(listCalls[0]).toMatchObject({
			before: undefined,
			cursor: undefined,
			limit: 100,
			organizationId: ORGANIZATION_ID,
		});
	});

	test("exports a single page under the limit in one query", async () => {
		pages = [eventPage(0, 3)];

		const result = await call(auditRouter.export)({ includeTechnical: false });

		expect(result.rowCount).toBe(3);
		expect(result.truncated).toBe(false);
		expect(result.content.trim().split("\n")).toHaveLength(4);
		expect(listCalls).toHaveLength(1);
	});

	test("pins later pages to the first-page snapshot and advances the cursor", async () => {
		const firstPage = eventPage(0, 101);
		pages = [firstPage, eventPage(100, 40)];

		const result = await call(auditRouter.export)({ includeTechnical: false });

		expect(result.rowCount).toBe(140);
		expect(result.truncated).toBe(false);
		expect(listCalls).toHaveLength(2);
		expect(listCalls[1]?.before).toEqual(cursorOf(firstPage[0]));
		expect(listCalls[1]?.cursor).toEqual(cursorOf(firstPage[99]));
	});

	test("stops at the export cap and reports truncation", async () => {
		repeatingPage = eventPage(0, 101);

		const result = await call(auditRouter.export)({ includeTechnical: false });

		expect(result.rowCount).toBe(10_000);
		expect(result.truncated).toBe(true);
		expect(listCalls).toHaveLength(100);
		expect(mockAppendAudit).toHaveBeenCalledTimes(1);
	});

	test("rejects exports over the rate limit before querying", async () => {
		rateLimitSuccess = false;

		await expect(
			call(auditRouter.export)({ includeTechnical: false })
		).rejects.toMatchObject({ code: "RATE_LIMITED" });
		expect(listCalls).toHaveLength(0);
	});
});

describe("audit.list cursor stability", () => {
	test("returns a cursor that decodes back to the last listed event", async () => {
		const rows = eventPage(0, 51);
		pages = [rows, eventPage(50, 10)];

		const firstPage = await call(auditRouter.list)({
			includeTechnical: false,
			limit: 50,
		});

		expect(firstPage.events).toHaveLength(50);
		expect(firstPage.hasMore).toBe(true);
		expect(firstPage.nextCursor).toBe(encodeAuditCursor(rows[49]));

		await call(auditRouter.list)({
			cursor: firstPage.nextCursor ?? undefined,
			includeTechnical: false,
			limit: 50,
		});

		expect(listCalls[1]?.cursor).toEqual(cursorOf(rows[49]));
	});

	test("rejects a malformed cursor", async () => {
		await expect(
			call(auditRouter.list)({
				cursor: "not-a-cursor",
				includeTechnical: false,
				limit: 50,
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(listCalls).toHaveLength(0);
	});
});
