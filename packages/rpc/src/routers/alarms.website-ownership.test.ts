import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as drizzleOrm from "drizzle-orm";
import { createProcedureClient } from "@orpc/server";
import type { Context } from "../orpc";

const ORGANIZATION_A = "org-a";
const WEBSITE_A = "site-a";
const WEBSITE_B = "site-b";

const mockWithWorkspace = mock(async () => ({
	organizationId: ORGANIZATION_A,
	role: "admin",
}));
const mockAppendAuditEvent = mock(async () => undefined);

function alarmRow() {
	const now = new Date("2026-08-21T00:00:00.000Z");
	return {
		createdAt: now,
		description: null,
		destinations: [],
		enabled: true,
		id: "alarm-a",
		name: "Owned alarm",
		organizationId: ORGANIZATION_A,
		triggerConditions: {},
		triggerType: "traffic_spike",
		updatedAt: now,
		websiteId: null,
	};
}

const txStub = {
	delete: () => ({ where: async () => [] }),
	insert: () => ({ values: async () => [] }),
	update: () => ({ set: () => ({ where: async () => [] }) }),
};

let alarmsRouter: typeof import("./alarms").alarmsRouter;

beforeAll(async () => {
	mock.module("@databuddy/auth", () => ({
		auth: { api: { getSession: async () => null } },
	}));
	mock.module("@databuddy/db", () => ({
		...drizzleOrm,
		db: { query: { alarms: { findFirst: async () => alarmRow() } } },
		withTransaction: async <T>(
			callback: (tx: typeof txStub) => Promise<T>
		): Promise<T> => callback(txStub),
	}));
	mock.module("../procedures/with-workspace", () => ({
		withWorkspace: mockWithWorkspace,
	}));
	const actualServicesAudit = await import("@databuddy/services/audit");
	mock.module("@databuddy/services/audit", () => ({
		...actualServicesAudit,
		appendAuditEvent: mockAppendAuditEvent,
	}));

	({ alarmsRouter } = await import("./alarms"));

	mock.restore();
});

function call<T>(procedure: T, context: Context) {
	return createProcedureClient(procedure as never, { context });
}

function contextWithMatchedWebsites(matchedWebsiteIds: string[]): Context {
	const database = {
		select: () => ({
			from: () => ({
				where: async () => matchedWebsiteIds.map((id) => ({ id })),
			}),
		}),
	};

	return {
		auditOrganizationId: undefined,
		anonymousId: null,
		apiKey: undefined,
		db: database,
		getBilling: async () => undefined,
		headers: new Headers(),
		organizationId: ORGANIZATION_A,
		session: undefined,
		sessionId: null,
		user: {
			email: "admin@example.com",
			id: "user-a",
			name: "Admin",
		},
	} as Context;
}

function createInput(websiteId?: string | null) {
	return {
		description: undefined,
		destinations: [
			{ config: {}, identifier: "owner@example.com", type: "email" },
		],
		enabled: true,
		name: "New alarm",
		organizationId: ORGANIZATION_A,
		triggerConditions: {},
		triggerType: "traffic_spike",
		...(websiteId === undefined ? {} : { websiteId }),
	};
}

describe("alarms website ownership", () => {
	beforeEach(() => {
		mockWithWorkspace.mockClear();
		mockAppendAuditEvent.mockClear();
	});

	it("rejects create when the website belongs to another organization", async () => {
		await expect(
			call(
				alarmsRouter.create,
				contextWithMatchedWebsites([])
			)(createInput(WEBSITE_B))
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"This alert can only be linked to a website in the selected organization.",
		});
	});

	it("rejects update when the website belongs to another organization", async () => {
		await expect(
			call(
				alarmsRouter.update,
				contextWithMatchedWebsites([])
			)({
				alarmId: "alarm-a",
				websiteId: WEBSITE_B,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"This alert can only be linked to a website in the selected organization.",
		});
	});

	it("allows create for a website in the selected organization", async () => {
		const result = await call(
			alarmsRouter.create,
			contextWithMatchedWebsites([WEBSITE_A])
		)(createInput(WEBSITE_A));

		expect(result.id).toBe("alarm-a");
	});

	it("allows create without a website", async () => {
		const result = await call(
			alarmsRouter.create,
			contextWithMatchedWebsites([])
		)(createInput());

		expect(result.id).toBe("alarm-a");
	});

	it("allows update that unlinks the website", async () => {
		const result = await call(
			alarmsRouter.update,
			contextWithMatchedWebsites([])
		)({
			alarmId: "alarm-a",
			websiteId: null,
		});

		expect(result.id).toBe("alarm-a");
	});
});
