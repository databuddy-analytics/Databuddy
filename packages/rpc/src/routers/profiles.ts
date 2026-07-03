import { and, eq, inArray } from "@databuddy/db";
import { profileAliases, profiles } from "@databuddy/db/schema";
import { z } from "zod";
import { trackedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const profileOutputSchema = z.object({
	profileId: z.string(),
	displayName: z.string().nullable(),
	email: z.string().nullable(),
	traits: z.record(z.string(), z.unknown()),
	firstSeenAt: z.date(),
	updatedAt: z.date(),
});

export const profilesRouter = {
	getByIds: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/getByIds",
			tags: ["Profiles"],
			summary: "Get profiles by ids",
			description:
				"Returns identified user profiles for the given profile ids. Requires website read permission.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				profileIds: z.array(z.string().min(1).max(128)).min(1).max(100),
			})
		)
		.output(z.array(profileOutputSchema))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			return await context.db
				.select({
					profileId: profiles.profileId,
					displayName: profiles.displayName,
					email: profiles.email,
					traits: profiles.traits,
					firstSeenAt: profiles.firstSeenAt,
					updatedAt: profiles.updatedAt,
				})
				.from(profiles)
				.where(
					and(
						eq(profiles.websiteId, input.websiteId),
						inArray(profiles.profileId, input.profileIds)
					)
				);
		}),

	get: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/get",
			tags: ["Profiles"],
			summary: "Get profile",
			description:
				"Returns one identified user profile with its device aliases, or null when the visitor is anonymous. Requires website read permission.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				profileId: z.string().min(1).max(128),
			})
		)
		.output(
			profileOutputSchema
				.extend({ anonymousIds: z.array(z.string()) })
				.nullable()
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const [profile] = await context.db
				.select({
					profileId: profiles.profileId,
					displayName: profiles.displayName,
					email: profiles.email,
					traits: profiles.traits,
					firstSeenAt: profiles.firstSeenAt,
					updatedAt: profiles.updatedAt,
				})
				.from(profiles)
				.where(
					and(
						eq(profiles.websiteId, input.websiteId),
						eq(profiles.profileId, input.profileId)
					)
				)
				.limit(1);

			if (!profile) {
				return null;
			}

			const aliases = await context.db
				.select({ anonymousId: profileAliases.anonymousId })
				.from(profileAliases)
				.where(
					and(
						eq(profileAliases.websiteId, input.websiteId),
						eq(profileAliases.profileId, input.profileId)
					)
				);

			return {
				...profile,
				anonymousIds: aliases.map((alias) => alias.anonymousId),
			};
		}),
};
