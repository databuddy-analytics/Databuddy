import { userPreferences } from "@databuddy/db/schema";
import { invalidateUserPreferencesCache } from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { sessionProcedure, trackedSessionProcedure } from "../orpc";

const defaultPreferences = {
	timezone: "auto",
	dateFormat: "MMM D, YYYY",
	timeFormat: "h:mm a",
} as const;

const preferencesOutputSchema = z.record(z.string(), z.unknown());

export const preferencesRouter = {
	getUserPreferences: sessionProcedure
		.route({
			description: "Returns user preferences.",
			method: "POST",
			path: "/preferences/getUserPreferences",
			summary: "Get user preferences",
			tags: ["Preferences"],
		})
		.output(preferencesOutputSchema)
		.handler(async ({ context }) => {
			let preferences = await context.db.query.userPreferences.findFirst({
				where: { userId: context.user.id },
			});

			if (!preferences) {
				const inserted = await context.db
					.insert(userPreferences)
					.values({
						id: randomUUIDv7(),
						userId: context.user.id,
						...defaultPreferences,
						updatedAt: new Date(),
					})
					.returning();
				preferences = inserted[0];
			}
			return preferences;
		}),

	updateUserPreferences: trackedSessionProcedure
		.route({
			description: "Updates user preferences.",
			method: "POST",
			path: "/preferences/updateUserPreferences",
			summary: "Update user preferences",
			tags: ["Preferences"],
		})
		.input(
			z.object({
				timezone: z.string().optional(),
				dateFormat: z.string().optional(),
				timeFormat: z.string().optional(),
			})
		)
		.output(preferencesOutputSchema)
		.handler(async ({ context, input }) => {
			const now = new Date();

			const result = await context.db
				.insert(userPreferences)
				.values({
					id: randomUUIDv7(),
					userId: context.user.id,
					timezone: input.timezone ?? defaultPreferences.timezone,
					dateFormat: input.dateFormat ?? defaultPreferences.dateFormat,
					timeFormat: input.timeFormat ?? defaultPreferences.timeFormat,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: userPreferences.userId,
					set: {
						timezone: input.timezone,
						dateFormat: input.dateFormat,
						timeFormat: input.timeFormat,
						updatedAt: now,
					},
				})
				.returning();

			await invalidateUserPreferencesCache(context.user.id).catch(() => {
				// Preferences cache is best-effort; the database write succeeded.
			});

			return result[0];
		}),
};
