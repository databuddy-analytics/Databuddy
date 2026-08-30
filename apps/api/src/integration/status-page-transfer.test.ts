import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { appRouter } from "@databuddy/rpc";
import { eq } from "@databuddy/db";
import {
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
} from "@databuddy/db/schema";
import {
	reset,
	cleanup,
	hasTestDb,
	db,
	userContext,
	expectCode,
	insertOrganization,
	insertWebsite,
	signUp,
	addToOrganization,
} from "@databuddy/test";
import { call } from "./helpers";

const iit = hasTestDb ? it : it.skip;

beforeEach(() => reset());
afterAll(() => cleanup());

let seq = 0;
function nextId(prefix: string) {
	seq += 1;
	return `${prefix}_${Date.now()}_${seq}`;
}

async function insertSchedule(
	organizationId: string,
	overrides: Partial<typeof uptimeSchedules.$inferInsert> = {}
) {
	const id = nextId("sched");
	await db()
		.insert(uptimeSchedules)
		.values({
			id,
			organizationId,
			url: `https://example.com/${id}`,
			name: id,
			granularity: "ten_minutes",
			cron: "*/10 * * * *",
			...overrides,
		});
	return id;
}

async function insertStatusPage(organizationId: string) {
	const id = nextId("page");
	await db().insert(statusPages).values({
		id,
		organizationId,
		name: `Page ${id}`,
		slug: id.replaceAll("_", "-"),
	});
	return id;
}

async function attachMonitor(statusPageId: string, uptimeScheduleId: string) {
	const id = nextId("spm");
	await db().insert(statusPageMonitors).values({
		id,
		statusPageId,
		uptimeScheduleId,
	});
	return id;
}

async function setupOrgs() {
	const user = await signUp();
	const source = await insertOrganization();
	const target = await insertOrganization();
	await addToOrganization(user.id, source.id, "owner");
	await addToOrganization(user.id, target.id, "owner");
	return { user, source, target };
}

async function getPageOrg(pageId: string) {
	const [page] = await db()
		.select({ organizationId: statusPages.organizationId })
		.from(statusPages)
		.where(eq(statusPages.id, pageId));
	return page?.organizationId;
}

async function getScheduleOrg(scheduleId: string) {
	const [schedule] = await db()
		.select({ organizationId: uptimeSchedules.organizationId })
		.from(uptimeSchedules)
		.where(eq(uptimeSchedules.id, scheduleId));
	return schedule?.organizationId;
}

async function getPageMonitors(pageId: string) {
	return db()
		.select()
		.from(statusPageMonitors)
		.where(eq(statusPageMonitors.statusPageId, pageId));
}

describe("statusPage.transfer", () => {
	iit("detaches monitors when includeMonitors is false", async () => {
		const { user, source, target } = await setupOrgs();
		const pageId = await insertStatusPage(source.id);
		const scheduleId = await insertSchedule(source.id);
		await attachMonitor(pageId, scheduleId);

		const result = await call(
			appRouter.statusPage.transfer,
			userContext(user, source.id)
		)({
			statusPageId: pageId,
			targetOrganizationId: target.id,
			includeMonitors: false,
		});

		expect(result.success).toBe(true);
		expect(await getPageOrg(pageId)).toBe(target.id);
		expect(await getPageMonitors(pageId)).toHaveLength(0);
		expect(await getScheduleOrg(scheduleId)).toBe(source.id);
	});

	iit("moves exclusively-attached monitors when includeMonitors is true", async () => {
		const { user, source, target } = await setupOrgs();
		const pageId = await insertStatusPage(source.id);
		const scheduleId = await insertSchedule(source.id);
		await attachMonitor(pageId, scheduleId);

		const result = await call(
			appRouter.statusPage.transfer,
			userContext(user, source.id)
		)({
			statusPageId: pageId,
			targetOrganizationId: target.id,
			includeMonitors: true,
		});

		expect(result.success).toBe(true);
		expect(await getPageOrg(pageId)).toBe(target.id);
		expect(await getScheduleOrg(scheduleId)).toBe(target.id);
		expect(await getPageMonitors(pageId)).toHaveLength(1);
	});

	iit("rejects moving website-linked monitors", async () => {
		const { user, source, target } = await setupOrgs();
		const website = await insertWebsite({ organizationId: source.id });
		const pageId = await insertStatusPage(source.id);
		const scheduleId = await insertSchedule(source.id, {
			websiteId: website.id,
		});
		await attachMonitor(pageId, scheduleId);

		await expectCode(
			call(appRouter.statusPage.transfer, userContext(user, source.id))({
				statusPageId: pageId,
				targetOrganizationId: target.id,
				includeMonitors: true,
			}),
			"BAD_REQUEST"
		);

		expect(await getPageOrg(pageId)).toBe(source.id);
		expect(await getScheduleOrg(scheduleId)).toBe(source.id);
	});

	iit("rejects moving monitors shared with another status page", async () => {
		const { user, source, target } = await setupOrgs();
		const pageA = await insertStatusPage(source.id);
		const pageB = await insertStatusPage(source.id);
		const scheduleId = await insertSchedule(source.id);
		await attachMonitor(pageA, scheduleId);
		await attachMonitor(pageB, scheduleId);

		await expectCode(
			call(appRouter.statusPage.transfer, userContext(user, source.id))({
				statusPageId: pageA,
				targetOrganizationId: target.id,
				includeMonitors: true,
			}),
			"BAD_REQUEST"
		);

		expect(await getPageOrg(pageA)).toBe(source.id);
		expect(await getScheduleOrg(scheduleId)).toBe(source.id);
		expect(await getPageMonitors(pageA)).toHaveLength(1);
	});
});
