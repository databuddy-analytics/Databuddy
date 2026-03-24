import { eq, userPreferences } from "@databuddy/db";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "..";
import { protectedProcedure } from "../orpc";

const defaultPreferences = {
	timezone: "auto",
	dateFormat: "MMM D, YYYY",
	timeFormat: "h:mm a",
} as const;

const preferencesOutputSchema = z.record(z.string(), z.unknown());

export const preferencesRouter = {
	getUserPreferences: protectedProcedure
		.route({
			description: "Returns user preferences.",
			method: "POST",
			path: "/preferences/getUserPreferences",
			summary: "Get user preferences",
			tags: ["Preferences"],
		})
		.output(preferencesOutputSchema)
		.handler(async ({ context }) => {
			if (!context.user) {
				throw rpcError.unauthorized("User not authenticated");
			}
			let preferences = await context.db.query.userPreferences.findFirst({
				where: eq(userPreferences.userId, context.user.id),
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

	updateUserPreferences: protectedProcedure
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
			if (!context.user) {
				throw rpcError.unauthorized("User not authenticated");
			}
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

			return result[0];
		}),
};
