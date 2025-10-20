import { userPreferences } from '@databuddy/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const preferencesSchema = z.object({
	timezone: z.string().optional(),
	dateFormat: z.string().optional(),
	timeFormat: z.string().optional(),
});

const defaultPreferences = {
	timezone: 'auto',
	dateFormat: 'MMM D, YYYY',
	timeFormat: 'h:mm a',
} as const;

export const preferencesRouter = createTRPCRouter({
	getUserPreferences: protectedProcedure.query(async ({ ctx }) => {
		let preferences = await ctx.db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, ctx.user.id),
		});

		if (!preferences) {
			const inserted = await ctx.db
				.insert(userPreferences)
				.values({
					id: nanoid(),
					userId: ctx.user.id,
					...defaultPreferences,
					updatedAt: new Date(),
				})
				.returning();
			preferences = inserted[0];
		}
		return preferences;
	}),

	updateUserPreferences: protectedProcedure
		.input(preferencesSchema)
		.mutation(async ({ ctx, input }) => {
			const now = new Date();

			const result = await ctx.db
				.insert(userPreferences)
				.values({
					id: nanoid(),
					userId: ctx.user.id,
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
});
