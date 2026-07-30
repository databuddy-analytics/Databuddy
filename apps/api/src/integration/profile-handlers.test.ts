import "@databuddy/test/env";

import {
	profileAliases,
	profiles,
	profileTraitChanges,
} from "@databuddy/db/schema";
import { eq } from "@databuddy/db";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	getTraitDistribution,
	resolveTraitSegment,
	splitTraits,
	upsertProfile,
} from "@databuddy/services/identity";
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

describe("profiles.getHistory", () => {
	iit("returns trait changes newest first", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1");
		await db()
			.insert(profileTraitChanges)
			.values([
				{
					id: "change_old",
					websiteId: website.id,
					profileId: "user_1",
					traits: { plan: "free" },
					changes: { plan: { old: null, new: "free" } },
					source: "identify",
					createdAt: new Date("2026-01-01T00:00:00Z"),
				},
				{
					id: "change_new",
					websiteId: website.id,
					profileId: "user_1",
					traits: { plan: "pro" },
					changes: { plan: { old: "free", new: "pro" } },
					source: "billing",
					createdAt: new Date("2026-02-01T00:00:00Z"),
				},
			]);

		const result = await call(appRouter.profiles.getHistory, {
			...userContext(user, org.id),
		})({ websiteId: website.id, profileId: "user_1" });

		expect(result.map((r) => r.source)).toEqual(["billing", "identify"]);
		expect(result[0]?.changes).toEqual({ plan: { old: "free", new: "pro" } });
	});

	iit("does not leak history from another organization's website", async () => {
		const outsider = await signUp();
		const outsiderOrg = await insertOrganization();
		await addToOrganization(outsider.id, outsiderOrg.id, "member");

		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });

		await expectCode(
			call(appRouter.profiles.getHistory, {
				...userContext(outsider, outsiderOrg.id),
			})({ websiteId: website.id, profileId: "user_1" }),
			"FORBIDDEN"
		);
	});
});

describe("upsertProfile trait history", () => {
	iit("records baseline on first identify, diff on the next", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });

		await upsertProfile(website.id, "user_1", splitTraits({ plan: "free" }));
		await upsertProfile(
			website.id,
			"user_1",
			splitTraits({ plan: "pro" }),
			"billing"
		);

		const rows = await db()
			.select()
			.from(profileTraitChanges)
			.where(eq(profileTraitChanges.profileId, "user_1"))
			.orderBy(profileTraitChanges.createdAt);

		expect(rows).toHaveLength(2);
		expect(rows[0]?.changes).toEqual({ plan: { old: null, new: "free" } });
		expect(rows[0]?.source).toBe("identify");
		expect(rows[1]?.changes).toEqual({ plan: { old: "free", new: "pro" } });
		expect(rows[1]?.source).toBe("billing");
		expect(rows[1]?.traits).toEqual({ plan: "pro" });
	});

	iit("writes no history row when traits are unchanged", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });

		await upsertProfile(website.id, "user_1", splitTraits({ plan: "pro" }));
		await upsertProfile(website.id, "user_1", splitTraits({ plan: "pro" }));

		const rows = await db()
			.select()
			.from(profileTraitChanges)
			.where(eq(profileTraitChanges.profileId, "user_1"));

		expect(rows).toHaveLength(1);
	});

	iit("cascades history deletion when the profile is deleted", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });

		await upsertProfile(website.id, "user_1", splitTraits({ plan: "pro" }));
		expect(
			await db()
				.select()
				.from(profileTraitChanges)
				.where(eq(profileTraitChanges.profileId, "user_1"))
		).toHaveLength(1);

		await db().delete(profiles).where(eq(profiles.profileId, "user_1"));

		expect(
			await db()
				.select()
				.from(profileTraitChanges)
				.where(eq(profileTraitChanges.profileId, "user_1"))
		).toHaveLength(0);
	});
});

describe("profiles.findByEmail", () => {
	iit("finds a profile by exact email via the lookup hash", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });
		await upsertProfile(
			website.id,
			"user_1",
			splitTraits({ email: "Jo@Acme.com", name: "Jo" })
		);
		const ctx = userContext(user, org.id);

		const found = await call(appRouter.profiles.findByEmail, ctx)({
			websiteId: website.id,
			email: "jo@acme.com",
		});
		expect(found).toEqual({ profileId: "user_1" });

		const missing = await call(appRouter.profiles.findByEmail, ctx)({
			websiteId: website.id,
			email: "nobody@acme.com",
		});
		expect(missing).toBeNull();
	});
});

describe("profiles.traitKeys / traitValues", () => {
	iit("lists distinct keys and values for the website only", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const website = await insertWebsite({ organizationId: org.id });
		const otherWebsite = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1", {
			traits: { plan: "pro", beta: true },
		});
		await seedProfile(website.id, "user_2", { traits: { plan: "free" } });
		await seedProfile(otherWebsite.id, "user_3", {
			traits: { region: "eu" },
		});
		const ctx = userContext(user, org.id);

		const keys = await call(appRouter.profiles.traitKeys, ctx)({
			websiteId: website.id,
		});
		expect(keys).toEqual(["beta", "plan"]);

		const values = await call(appRouter.profiles.traitValues, ctx)({
			websiteId: website.id,
			key: "plan",
		});
		expect(values).toEqual(["free", "pro"]);
	});

	iit("rejects non-members", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const ctx = userContext(user, org.id);

		await expectCode(
			call(appRouter.profiles.traitKeys, ctx)({ websiteId: website.id }),
			"FORBIDDEN"
		);
	});
});

describe("getTraitDistribution", () => {
	iit("ranks values per key with profile counts", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "u1", { traits: { plan: "pro" } });
		await seedProfile(website.id, "u2", { traits: { plan: "pro" } });
		await seedProfile(website.id, "u3", {
			traits: { plan: "free", beta: true },
		});

		const distribution = await getTraitDistribution(website.id);
		expect(distribution).toMatchObject({
			hasMoreKeys: false,
			hasMoreValues: false,
			identifiedProfiles: 3,
			returnedTraitKeys: 2,
			totalTraitKeys: 2,
			valuesPerKey: 20,
		});
		expect(distribution.traits).toEqual([
			{ key: "beta", value: "true", profiles: 1 },
			{ key: "plan", value: "pro", profiles: 2 },
			{ key: "plan", value: "free", profiles: 1 },
		]);
	});

	iit("gives every returned key a value before adding more values per key", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const keys = Array.from({ length: 11 }, (_, index) => `trait_${index}`);

		await Promise.all(
			Array.from({ length: 20 }, (_, valueIndex) =>
				seedProfile(website.id, `user_${valueIndex}`, {
					traits: Object.fromEntries(
						keys.map((key) => [key, `value_${valueIndex}`])
					),
				})
			)
		);

		const distribution = await getTraitDistribution(website.id);
		expect(distribution).toMatchObject({
			hasMoreKeys: false,
			hasMoreValues: true,
			returnedTraitKeys: 11,
			totalTraitKeys: 11,
			valuesPerKey: 18,
		});
		expect(distribution.traits).toHaveLength(198);
		expect(new Set(distribution.traits.map((trait) => trait.key))).toEqual(
			new Set(keys)
		);
	});

	iit("reports when lower-coverage keys are omitted by the row bound", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1", {
			traits: Object.fromEntries(
				Array.from({ length: 201 }, (_, index) => [`trait_${index}`, true])
			),
		});

		const distribution = await getTraitDistribution(website.id);
		expect(distribution).toMatchObject({
			hasMoreKeys: true,
			hasMoreValues: false,
			returnedTraitKeys: 200,
			totalTraitKeys: 201,
			valuesPerKey: 1,
		});
		expect(distribution.traits).toHaveLength(200);
	});
});

describe("resolveTraitSegment", () => {
	iit("resolves profile ids by trait predicate scoped to the website", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const otherWebsite = await insertWebsite({ organizationId: org.id });
		await seedProfile(website.id, "user_1", { traits: { plan: "pro" } });
		await seedProfile(website.id, "user_2", { traits: { plan: "free" } });
		await seedProfile(website.id, "user_3", {
			traits: { plan: "pro", beta: true },
		});
		await seedProfile(otherWebsite.id, "user_4", { traits: { plan: "pro" } });

		const pro = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "eq", value: "pro" },
		]);
		expect(pro.sort()).toEqual(["user_1", "user_3"]);

		const proBeta = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "eq", value: "pro" },
			{ field: "trait:beta", op: "eq", value: "true" },
		]);
		expect(proBeta).toEqual(["user_3"]);

		const notPro = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "ne", value: "pro" },
		]);
		expect(notPro).toEqual(["user_2"]);

		const inList = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "in", value: ["free", "trial"] },
		]);
		expect(inList).toEqual(["user_2"]);

		const emptyIn = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "in", value: [] },
		]);
		expect(emptyIn).toEqual([]);

		const emptyNotIn = await resolveTraitSegment(website.id, [
			{ field: "trait:plan", op: "not_in", value: [] },
		]);
		expect(emptyNotIn.sort()).toEqual(["user_1", "user_2", "user_3"]);
	});
});
