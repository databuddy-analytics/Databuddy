import "@databuddy/db/test-env";
import { beforeAll, describe, expect, it } from "bun:test";
import { randomUUIDv7 } from "bun";
import { sql } from "drizzle-orm";
import { createProcedureClient } from "@orpc/server";
import { db } from "@databuddy/db";
import {
	alarms,
	member,
	organization,
	user,
	websites,
} from "@databuddy/db/schema";
import type { Context } from "../orpc";
import { alarmsRouter } from "./alarms";

async function hasDatabase(): Promise<boolean> {
	try {
		await db.execute(sql`SELECT 1`);
		return true;
	} catch {
		return false;
	}
}

const databaseAvailable = await hasDatabase();
if (process.env.CI && !databaseAvailable) {
	throw new Error(
		"Alarms ownership integration tests need the test database; CI must not skip them."
	);
}
const integration = databaseAvailable ? describe : describe.skip;

const runId = randomUUIDv7();
const ORGANIZATION_A = `alarm-test-org-a-${runId}`;
const ORGANIZATION_B = `alarm-test-org-b-${runId}`;
const USER_A = `alarm-test-user-a-${runId}`;
const WEBSITE_A = `alarm-test-site-a-${runId}`;
const WEBSITE_B = `alarm-test-site-b-${runId}`;

function testContext(): Context {
	return {
		auditOrganizationId: undefined,
		anonymousId: null,
		apiKey: undefined,
		db,
		getBilling: async () => undefined,
		headers: new Headers(),
		organizationId: ORGANIZATION_A,
		session: undefined,
		sessionId: null,
		user: {
			email: `alarm-admin-${runId}@example.com`,
			id: USER_A,
			name: "Alarm Admin",
		},
	} as Context;
}

function emailDestination() {
	return {
		config: {},
		identifier: `owner-${runId}@example.com`,
		type: "email",
	};
}

integration("alarms website ownership against isolated PostgreSQL", () => {
	let alarmId: string;

	beforeAll(async () => {
		const now = new Date();
		await db.insert(organization).values([
			{ createdAt: now, id: ORGANIZATION_A, name: "Alarm test org A" },
			{ createdAt: now, id: ORGANIZATION_B, name: "Alarm test org B" },
		]);
		await db.insert(user).values({
			createdAt: now,
			email: `alarm-admin-${runId}@example.com`,
			emailVerified: true,
			id: USER_A,
			name: "Alarm Admin",
			updatedAt: now,
		});
		await db.insert(member).values({
			createdAt: now,
			id: `alarm-test-member-${runId}`,
			organizationId: ORGANIZATION_A,
			role: "admin",
			userId: USER_A,
		});
		await db.insert(websites).values([
			{
				domain: `alarm-a-${runId}.example.com`,
				id: WEBSITE_A,
				organizationId: ORGANIZATION_A,
			},
			{
				domain: `alarm-b-${runId}.example.com`,
				id: WEBSITE_B,
				organizationId: ORGANIZATION_B,
			},
		]);

		const created = await createProcedureClient(alarmsRouter.create, {
			context: testContext(),
		})({
			destinations: [emailDestination()],
			name: "Owned alarm",
			organizationId: ORGANIZATION_A,
			triggerConditions: {},
			triggerType: "traffic_spike",
			websiteId: WEBSITE_A,
		});
		alarmId = created.id;
		expect(alarms).toBeDefined();
	});

	it("rejects create when the website belongs to another organization", async () => {
		await expect(
			createProcedureClient(alarmsRouter.create, {
				context: testContext(),
			})({
				destinations: [emailDestination()],
				name: "Foreign alarm",
				organizationId: ORGANIZATION_A,
				triggerConditions: {},
				triggerType: "traffic_spike",
				websiteId: WEBSITE_B,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"This alert can only be linked to a website in the selected organization.",
		});
	});

	it("rejects update when the website belongs to another organization", async () => {
		await expect(
			createProcedureClient(alarmsRouter.update, {
				context: testContext(),
			})({
				alarmId,
				websiteId: WEBSITE_B,
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"This alert can only be linked to a website in the selected organization.",
		});
	});

	it("allows create for a website in the selected organization", async () => {
		const result = await createProcedureClient(alarmsRouter.create, {
			context: testContext(),
		})({
			destinations: [emailDestination()],
			name: "Another owned alarm",
			organizationId: ORGANIZATION_A,
			triggerConditions: {},
			triggerType: "traffic_spike",
			websiteId: WEBSITE_A,
		});

		expect(result.id).toBeString();
	});

	it("allows create without a website", async () => {
		const result = await createProcedureClient(alarmsRouter.create, {
			context: testContext(),
		})({
			destinations: [emailDestination()],
			name: "Org-wide alarm",
			organizationId: ORGANIZATION_A,
			triggerConditions: {},
			triggerType: "traffic_spike",
		});

		expect(result.id).toBeString();
	});

	it("allows update that unlinks the website", async () => {
		const result = await createProcedureClient(alarmsRouter.update, {
			context: testContext(),
		})({
			alarmId,
			websiteId: null,
		});

		expect(result.id).toBe(alarmId);
	});
});
