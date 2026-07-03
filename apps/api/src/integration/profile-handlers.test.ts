import "@databuddy/test/env";

import { profileAliases, profiles } from "@databuddy/db/schema";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	addToOrganization,
	cleanup,
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
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const iit = hasTestDb ? it : it.skip;

function call<T>(procedure: T, ctx: Context) {
	return createProcedureClient(procedure as any, { context: ctx });
}

beforeEach(() => reset());
afterAll(() => cleanup());

async function seedProfile(
	websiteId: string,
	profileId: string,
	overrides: Partial<typeof profiles.$inferInsert> = {}
) {
	await db()
		.insert(profiles)
		.values({
			websiteId,
			profileId,
			email: `${profileId}@example.com`,
			displayName: `User ${profileId}`,
			traits: { plan: "pro" },
			...overrides,
		});
}

describe("profiles.getByIds", () => {
	iit("returns profiles for an organization member", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1");
		await seedProfile(website.id, "user_2", { email: null });

		const result = await call(appRouter.profiles.getByIds, {
			...userContext(user, org.id),
		})({
			websiteId: website.id,
			profileIds: ["user_1", "user_2", "user_missing"],
		});

		expect(result).toHaveLength(2);
		const first = result.find((p) => p.profileId === "user_1");
		expect(first?.email).toBe("user_1@example.com");
		expect(first?.displayName).toBe("User user_1");
		expect(first?.traits).toEqual({ plan: "pro" });
	});

	iit("does not leak profiles from another organization's website", async () => {
		const outsider = await signUp();
		const outsiderOrg = await insertOrganization();
		await addToOrganization(outsider.id, outsiderOrg.id, "member");

		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1");

		await expectCode(
			call(appRouter.profiles.getByIds, {
				...userContext(outsider, outsiderOrg.id),
			})({
				websiteId: website.id,
				profileIds: ["user_1"],
			}),
			"FORBIDDEN"
		);
	});
});

describe("profiles.get", () => {
	iit("returns a profile with its device aliases", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1");
		await db().insert(profileAliases).values([
			{ websiteId: website.id, anonymousId: "anon_a", profileId: "user_1" },
			{ websiteId: website.id, anonymousId: "anon_b", profileId: "user_1" },
		]);

		const result = await call(appRouter.profiles.get, {
			...userContext(user, org.id),
		})({ websiteId: website.id, profileId: "user_1" });

		expect(result?.profileId).toBe("user_1");
		expect(result?.anonymousIds?.sort()).toEqual(["anon_a", "anon_b"]);
	});

	iit("returns null for an unknown profile", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });

		const result = await call(appRouter.profiles.get, {
			...userContext(user, org.id),
		})({ websiteId: website.id, profileId: "user_ghost" });

		expect(result).toBeNull();
	});
});
