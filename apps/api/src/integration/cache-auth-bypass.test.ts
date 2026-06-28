import "@databuddy/test/env";

import { targetGroups } from "@databuddy/db/schema";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	addToOrganization,
	apiKeyContext,
	cleanup,
	context,
	db,
	expectCode,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const iit = hasTestDb ? it : it.skip;

function call<T>(procedure: T, ctx: Context) {
	return createProcedureClient(procedure as any, { context: ctx });
}

async function setupOwnedSite(siteOverrides?: { isPublic?: boolean }) {
	const user = await signUp();
	const org = await insertOrganization();
	await addToOrganization(user.id, org.id, "owner");
	const site = await insertWebsite({
		organizationId: org.id,
		...siteOverrides,
	});
	return { user, org, site };
}

async function seedTargetGroup(websiteId: string, createdBy: string) {
	await db()
		.insert(targetGroups)
		.values({
			id: randomUUIDv7(),
			websiteId,
			name: "Secret Targeting",
			color: "#FF0000",
			rules: [{ field: "country", operator: "equals", value: "US" }],
			createdBy,
		});
}

const annotationsParams = (websiteId: string) =>
	({
		websiteId,
		chartType: "metrics",
		chartContext: {
			dateRange: {
				start_date: "2024-01-01",
				end_date: "2024-01-31",
				granularity: "daily",
			},
		},
	}) as const;

beforeEach(() => reset());
afterAll(() => cleanup());

describe("cache-bypass auth: target-groups.list", () => {
	iit(
		"anon caller cannot read private-site target groups after authed prime",
		async () => {
			const { user, org, site } = await setupOwnedSite();
			await seedTargetGroup(site.id, user.id);

			const authed = await call(
				appRouter.targetGroups.list,
				userContext(user, org.id)
			)({ websiteId: site.id });
			expect(authed).toHaveLength(1);
			expect((authed[0] as { rules: unknown[] }).rules).toHaveLength(1);

			await expectCode(
				call(appRouter.targetGroups.list, context())({ websiteId: site.id }),
				"UNAUTHORIZED"
			);
		}
	);

	iit("cross-org user is rejected after authed prime", async () => {
		const a = await setupOwnedSite();
		const b = await setupOwnedSite();
		await seedTargetGroup(a.site.id, a.user.id);

		await call(
			appRouter.targetGroups.list,
			userContext(a.user, a.org.id)
		)({ websiteId: a.site.id });

		await expectCode(
			call(
				appRouter.targetGroups.list,
				userContext(b.user, b.org.id)
			)({ websiteId: a.site.id }),
			"FORBIDDEN"
		);
	});

	iit("demo caller cannot read target groups even when authed cache exists", async () => {
		const { user, org, site } = await setupOwnedSite({ isPublic: true });
		await seedTargetGroup(site.id, user.id);

		const authed = await call(
			appRouter.targetGroups.list,
			userContext(user, org.id)
		)({ websiteId: site.id });
		expect((authed[0] as { rules: unknown[] }).rules).toHaveLength(1);

		await expectCode(
			call(appRouter.targetGroups.list, context())({ websiteId: site.id }),
			"UNAUTHORIZED"
		);
	});

	iit("cross-org API key cannot read a website it does not own", async () => {
		const a = await setupOwnedSite();
		const orgB = await insertOrganization();
		await seedTargetGroup(a.site.id, a.user.id);

		await call(
			appRouter.targetGroups.list,
			userContext(a.user, a.org.id)
		)({ websiteId: a.site.id });

		await expectCode(
			call(
				appRouter.targetGroups.list,
				apiKeyContext(orgB.id, ["read:data"])
			)({ websiteId: a.site.id }),
			"FORBIDDEN"
		);
	});
});

describe("cache-bypass auth: flags.list", () => {
	iit("anon caller cannot read flags after authed prime", async () => {
		const { user, org, site } = await setupOwnedSite();

		await call(
			appRouter.flags.list,
			userContext(user, org.id)
		)({ websiteId: site.id });

		await expectCode(
			call(appRouter.flags.list, context())({ websiteId: site.id }),
			"UNAUTHORIZED"
		);
	});

	iit("cross-org user is rejected after authed prime", async () => {
		const a = await setupOwnedSite();
		const b = await setupOwnedSite();

		await call(
			appRouter.flags.list,
			userContext(a.user, a.org.id)
		)({ websiteId: a.site.id });

		await expectCode(
			call(
				appRouter.flags.list,
				userContext(b.user, b.org.id)
			)({ websiteId: a.site.id }),
			"FORBIDDEN"
		);
	});

	iit("demo caller cannot read public-site flag definitions", async () => {
		const { site } = await setupOwnedSite({ isPublic: true });

		await expectCode(
			call(appRouter.flags.list, context())({ websiteId: site.id }),
			"UNAUTHORIZED"
		);
	});
});

describe("cache-bypass auth: annotations.list", () => {
	iit("anon caller cannot read private-site annotations after authed prime", async () => {
		const { user, org, site } = await setupOwnedSite();

		await call(
			appRouter.annotations.list,
			userContext(user, org.id)
		)(annotationsParams(site.id));

		await expectCode(
			call(
				appRouter.annotations.list,
				context()
			)(annotationsParams(site.id)),
			"UNAUTHORIZED"
		);
	});

	iit("cross-org user is rejected after authed prime", async () => {
		const a = await setupOwnedSite();
		const b = await setupOwnedSite();

		await call(
			appRouter.annotations.list,
			userContext(a.user, a.org.id)
		)(annotationsParams(a.site.id));

		await expectCode(
			call(
				appRouter.annotations.list,
				userContext(b.user, b.org.id)
			)(annotationsParams(a.site.id)),
			"FORBIDDEN"
		);
	});
});
