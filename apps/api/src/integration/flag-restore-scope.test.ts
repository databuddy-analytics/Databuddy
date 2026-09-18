import "@databuddy/test/env";

import { eq } from "@databuddy/db";
import {
	flagChangeEvents,
	flags,
	flagsToTargetGroups,
	targetGroups,
} from "@databuddy/db/schema";
import { appRouter } from "@databuddy/rpc";
import {
	apiKeyContext,
	cleanup,
	db,
	hasTestDb,
	insertMember,
	insertOrganization,
	insertUser,
	insertWebsite,
	reset,
} from "@databuddy/test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "./helpers";

const iit = hasTestDb ? it : it.skip;

beforeEach(() => reset());
afterAll(() => cleanup());

async function setupRestore() {
	const user = await insertUser();
	const org = await insertOrganization();
	await insertMember({ organizationId: org.id, userId: user.id });
	const site = await insertWebsite({ organizationId: org.id });
	const [originalGroup] = await db()
		.insert(targetGroups)
		.values({
			id: crypto.randomUUID(),
			createdBy: user.id,
			name: "Original audience",
			websiteId: site.id,
		})
		.returning();
	const [flag] = await db()
		.insert(flags)
		.values({
			id: crypto.randomUUID(),
			createdBy: user.id,
			deletedAt: new Date("2026-01-01T00:00:00Z"),
			key: "restore-audience",
			name: "Deleted flag",
			websiteId: site.id,
		})
		.returning();
	await db().insert(flagsToTargetGroups).values({
		flagId: flag.id,
		targetGroupId: originalGroup.id,
	});
	const create = call(
		appRouter.flags.create,
		apiKeyContext(org.id, ["read:data", "manage:flags"])
	);
	const restore = (targetGroupIds: string[]) =>
		create({
			websiteId: site.id,
			key: flag.key,
			name: "Restored flag",
			type: "boolean",
			status: "inactive",
			defaultValue: false,
			rolloutPercentage: 0,
			targetGroupIds,
		});
	return { user, org, site, flag, originalGroup, restore };
}

describe("flag restoration target-group scope", () => {
	iit.each(["another organization", "another website", "deleted"] as const)(
		"rejects a group from %s and rolls back the restoration",
		async (groupState) => {
			const fixture = await setupRestore();
			const organizationId =
				groupState === "another organization"
					? (await insertOrganization()).id
					: fixture.org.id;
			const websiteId =
				groupState === "deleted"
					? fixture.site.id
					: (await insertWebsite({ organizationId })).id;
			const [group] = await db()
				.insert(targetGroups)
				.values({
					id: crypto.randomUUID(),
					createdBy: fixture.user.id,
					deletedAt: groupState === "deleted" ? new Date() : null,
					name: "Unavailable audience",
					websiteId,
				})
				.returning();

			await expect(fixture.restore([group.id])).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message:
					"One or more target groups not found or do not belong to this website",
			});
			const [unchanged] = await db()
				.select()
				.from(flags)
				.where(eq(flags.id, fixture.flag.id));
			expect(unchanged).toEqual(fixture.flag);
			expect(
				await db()
					.select()
					.from(flagsToTargetGroups)
					.where(eq(flagsToTargetGroups.flagId, fixture.flag.id))
			).toEqual([
				{ flagId: fixture.flag.id, targetGroupId: fixture.originalGroup.id },
			]);
			expect(
				await db()
					.select()
					.from(flagChangeEvents)
					.where(eq(flagChangeEvents.flagId, fixture.flag.id))
			).toEqual([]);
		}
	);

	iit("restores with an active group from the same website", async () => {
		const fixture = await setupRestore();
		const [group] = await db()
			.insert(targetGroups)
			.values({
				id: crypto.randomUUID(),
				createdBy: fixture.user.id,
				name: "Replacement audience",
				websiteId: fixture.site.id,
			})
			.returning();

		const restored = await fixture.restore([group.id]);
		expect(restored).toMatchObject({
			id: fixture.flag.id,
			deletedAt: null,
			name: "Restored flag",
		});
		expect(
			await db()
				.select()
				.from(flagsToTargetGroups)
				.where(eq(flagsToTargetGroups.flagId, fixture.flag.id))
		).toEqual([{ flagId: fixture.flag.id, targetGroupId: group.id }]);
		expect(
			await db()
				.select({ changeType: flagChangeEvents.changeType })
				.from(flagChangeEvents)
				.where(eq(flagChangeEvents.flagId, fixture.flag.id))
		).toEqual([{ changeType: "restored" }]);
	});
});
