import { eq, userPreferences } from "@databuddy/db";
import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure } from "../orpc";

const defaultPreferences = {
	timezone: "auto",
	dateFormat: "MMM D, YYYY",
	timeFormat: "h:mm a",
} as const;

export const preferencesRouter = {
	getUserPreferences: protectedProcedure.handler(async ({ context }) => {
		let preferences = await context.db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, context.user.id),
		});

		if (!preferences) {
			const inserted = await context.db
				.insert(userPreferences)
				.values({
					id: nanoid(),
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
		.input(
			z.object({
				timezone: z.string().optional(),
				dateFormat: z.string().optional(),
				timeFormat: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const now = new Date();

			const result = await context.db
				.insert(userPreferences)
				.values({
					id: nanoid(),
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
