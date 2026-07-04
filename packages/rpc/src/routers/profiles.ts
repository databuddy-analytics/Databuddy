import { and, desc, eq, inArray, sql } from "@databuddy/db";
import {
	profileAliases,
	profiles,
	profileTraitChanges,
} from "@databuddy/db/schema";
import { emailLookupHash, revealPii } from "@databuddy/services/identity";
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
	findByEmail: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/findByEmail",
			tags: ["Profiles"],
			summary: "Find profile by email",
			description:
				"Looks up an identified profile by exact email match via the deterministic email hash. Requires website read permission.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				email: z.string().email().max(320),
			})
		)
		.output(z.object({ profileId: z.string() }).nullable())
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const [row] = await context.db
				.select({ profileId: profiles.profileId })
				.from(profiles)
				.where(
					and(
						eq(profiles.websiteId, input.websiteId),
						eq(profiles.emailHash, emailLookupHash(input.email))
					)
				)
				.limit(1);

			return row ?? null;
		}),

	traitKeys: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/traitKeys",
			tags: ["Profiles"],
			summary: "List trait keys",
			description:
				"Returns the distinct trait keys present on this website's profiles. Requires website read permission.",
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(z.string()))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const rows = await context.db
				.selectDistinct({
					key: sql<string>`jsonb_object_keys(${profiles.traits})`,
				})
				.from(profiles)
				.where(eq(profiles.websiteId, input.websiteId))
				.orderBy(sql`1`)
				.limit(100);

			return rows.map((row) => row.key);
		}),

	traitValues: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/traitValues",
			tags: ["Profiles"],
			summary: "List trait values",
			description:
				"Returns the distinct values of one trait key across this website's profiles. Requires website read permission.",
		})
		.input(z.object({ websiteId: z.string(), key: z.string().min(1).max(128) }))
		.output(z.array(z.string()))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const rows = await context.db
				.selectDistinct({
					value: sql<string>`${profiles.traits}->>${input.key}`,
				})
				.from(profiles)
				.where(
					and(
						eq(profiles.websiteId, input.websiteId),
						sql`jsonb_exists(${profiles.traits}, ${input.key})`
					)
				)
				.orderBy(sql`1`)
				.limit(50);

			return rows.map((row) => row.value).filter((value) => value !== null);
		}),

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

			const rows = await context.db
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

			return rows.map((row) => ({
				...row,
				displayName: revealPii(row.displayName),
				email: revealPii(row.email),
			}));
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
				displayName: revealPii(profile.displayName),
				email: revealPii(profile.email),
				anonymousIds: aliases.map((alias) => alias.anonymousId),
			};
		}),

	getHistory: trackedProcedure
		.route({
			method: "POST",
			path: "/profiles/getHistory",
			tags: ["Profiles"],
			summary: "Get profile trait history",
			description:
				"Returns the trait change timeline for a profile, newest first. Each entry has the changed keys (old and new) and the full trait snapshot after the change. Requires website read permission.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				profileId: z.string().min(1).max(128),
				limit: z.number().min(1).max(200).default(50),
			})
		)
		.output(
			z.array(
				z.object({
					changes: z.record(
						z.string(),
						z.object({
							old: z.union([z.string(), z.number(), z.boolean(), z.null()]),
							new: z.union([z.string(), z.number(), z.boolean(), z.null()]),
						})
					),
					traits: z.record(z.string(), z.unknown()),
					source: z.string(),
					createdAt: z.date(),
				})
			)
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			return await context.db
				.select({
					changes: profileTraitChanges.changes,
					traits: profileTraitChanges.traits,
					source: profileTraitChanges.source,
					createdAt: profileTraitChanges.createdAt,
				})
				.from(profileTraitChanges)
				.where(
					and(
						eq(profileTraitChanges.websiteId, input.websiteId),
						eq(profileTraitChanges.profileId, input.profileId)
					)
				)
				.orderBy(desc(profileTraitChanges.createdAt))
				.limit(input.limit);
		}),
};
