'use server';

import { auth } from '@databuddy/auth';
import { db, eq, userPreferences } from '@databuddy/db';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { cache } from 'react';
import { z } from 'zod';
import { logger } from '@/lib/discord-webhook';

// Helper to get authenticated user
const getUser = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return null;
	}
	return session.user;
});

// Preferences schema
const preferencesSchema = z.object({
	timezone: z.string().optional(),
	dateFormat: z.string().optional(),
	timeFormat: z.string().optional(),
});

/**
 * Get user preferences, creating default ones if none exist
 */
export async function getUserPreferences() {
	const user = await getUser();
	if (!user) {
		return { error: 'Unauthorized' };
	}

	try {
		// Try to find existing preferences
		let preferences = await db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, user.id),
		});

		// Create default preferences if none exist
		if (!preferences) {
			const inserted = await db
				.insert(userPreferences)
				.values({
					id: nanoid(),
					userId: user.id,
					timezone: 'auto',
					dateFormat: 'MMM D, YYYY',
					timeFormat: 'h:mm a',
					updatedAt: new Date().toISOString(),
				})
				.returning();

			preferences = inserted[0];

			// Log first-time preferences setup (only when creating, not updating)
			await logger.info(
				'User Preferences Initialized',
				'Default preferences were created for new user',
				{
					userId: user.id,
					userName: user.name || user.email,
					timezone: preferences.timezone,
					dateFormat: preferences.dateFormat,
				}
			);
		}

		return { data: preferences };
	} catch (error) {
		console.error('Failed to get user preferences', { error });

		// Log preferences error
		await logger.error(
			'Preferences Setup Failed',
			'Failed to initialize user preferences',
			{
				userId: user.id,
				userName: user.name || user.email,
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		);

		return { error: 'Failed to get user preferences' };
	}
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(formData: FormData) {
	const user = await getUser();
	if (!user) {
		return { error: 'Unauthorized' };
	}

	try {
		// Parse and validate form data
		const timezone = formData.get('timezone') as string;
		const dateFormat = formData.get('dateFormat') as string;
		const timeFormat = formData.get('timeFormat') as string;

		// Validate the data
		const validatedData = preferencesSchema.parse({
			timezone,
			dateFormat,
			timeFormat,
		});

		// Get or create preferences
		let preferences = await db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, user.id),
		});

		if (preferences) {
			// Update existing preferences
			const updated = await db
				.update(userPreferences)
				.set({
					timezone: validatedData.timezone || preferences.timezone,
					dateFormat: validatedData.dateFormat || preferences.dateFormat,
					timeFormat: validatedData.timeFormat || preferences.timeFormat,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(userPreferences.userId, user.id))
				.returning();

			preferences = updated[0];
		} else {
			// Create if doesn't exist
			const inserted = await db
				.insert(userPreferences)
				.values({
					id: nanoid(),
					userId: user.id,
					timezone: validatedData.timezone || 'auto',
					dateFormat: validatedData.dateFormat || 'MMM D, YYYY',
					timeFormat: validatedData.timeFormat || 'h:mm a',
					updatedAt: new Date().toISOString(),
				})
				.returning();

			preferences = inserted[0];
		}

		revalidatePath('/settings');
		return { success: true, data: preferences };
	} catch (error) {
		console.error('Preferences update error:', error);
		if (error instanceof z.ZodError) {
			return { error: error.errors[0].message };
		}
		return { error: 'Failed to update preferences' };
	}
}
