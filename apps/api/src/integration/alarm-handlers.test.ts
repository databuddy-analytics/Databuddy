import "@databuddy/test/env";

import { appRouter, type Context } from "@databuddy/rpc";
import {
	addToOrganization,
	cleanup,
	expectCode,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient } from "@orpc/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const iit = hasTestDb ? it : it.skip;

beforeEach(() => reset());
afterAll(() => cleanup());

async function workspace() {
	const user = await signUp();
	const [org, foreignOrg] = await Promise.all([
		insertOrganization(),
		insertOrganization(),
	]);
	if (!(org && foreignOrg)) {
		throw new Error("Organization insert returned no row");
	}
	await addToOrganization(user.id, org.id, "owner");
	const [website, foreignWebsite] = await Promise.all([
		insertWebsite({ organizationId: org.id }),
		insertWebsite({ organizationId: foreignOrg.id }),
	]);
	if (!(website && foreignWebsite)) {
		throw new Error("Website insert returned no row");
	}
	return { context: userContext(user, org.id), org, website, foreignWebsite };
}

function createAlarm(
	context: Context,
	organizationId: string,
	websiteId?: string
) {
	return createProcedureClient(appRouter.alarms.create, { context })({
		organizationId,
		websiteId,
		name: "Uptime alert",
		triggerType: "uptime",
		triggerConditions: {},
		destinations: [
			{ type: "email", identifier: "owner@example.com", config: {} },
		],
	});
}

describe("alarms website ownership", () => {
	iit("rejects a website from another organization on create", async () => {
		const { context, org, foreignWebsite } = await workspace();

		await expectCode(
			createAlarm(context, org.id, foreignWebsite.id),
			"NOT_FOUND"
		);
	});

	iit("rejects a deleted website on create", async () => {
		const { context, org } = await workspace();
		const deleted = await insertWebsite({
			organizationId: org.id,
			deletedAt: new Date(),
		});
		if (!deleted) {
			throw new Error("Website insert returned no row");
		}

		await expectCode(createAlarm(context, org.id, deleted.id), "NOT_FOUND");
	});

	iit("links a website owned by the organization", async () => {
		const { context, org, website } = await workspace();

		const alarm = await createAlarm(context, org.id, website.id);

		expect(alarm.websiteId).toBe(website.id);
	});

	iit("creates an organization-wide alarm without a website", async () => {
		const { context, org } = await workspace();

		const alarm = await createAlarm(context, org.id);

		expect(alarm.websiteId).toBeNull();
	});

	iit(
		"rejects moving an alarm to a foreign website but allows unlinking",
		async () => {
			const { context, org, website, foreignWebsite } = await workspace();
			const alarm = await createAlarm(context, org.id, website.id);
			const update = createProcedureClient(appRouter.alarms.update, {
				context,
			});

			await expectCode(
				update({ alarmId: alarm.id, websiteId: foreignWebsite.id }),
				"NOT_FOUND"
			);

			const unlinked = await update({ alarmId: alarm.id, websiteId: null });
			expect(unlinked.websiteId).toBeNull();
		}
	);
});
