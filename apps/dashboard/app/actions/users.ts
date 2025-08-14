'use server';

import { auth } from '@databuddy/auth';
import { db, eq, user } from '@databuddy/db';
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

// Profile update schema
const profileUpdateSchema = z.object({
	firstName: z
		.string()
		.min(1, 'First name is required')
		.max(50, 'First name cannot exceed 50 characters'),
	lastName: z
		.string()
		.min(1, 'Last name is required')
		.max(50, 'Last name cannot exceed 50 characters'),
	image: z.string().url('Please enter a valid image URL').optional(),
});

/**
 * Updates the user's profile information
 */
export async function updateUserProfile(formData: FormData) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: 'Unauthorized' };
	}

	try {
		// Parse and validate form data
		const firstName = formData.get('firstName');
		const lastName = formData.get('lastName');
		const image = formData.get('image');

		// Validate the data
		const validatedData = profileUpdateSchema.parse({
			firstName,
			lastName,
			image: image || undefined,
		});

		// Update user in database
		const _updated = await db
			.update(user)
			.set({
				firstName: validatedData.firstName,
				lastName: validatedData.lastName,
				image: validatedData.image,
				// Set the display name to the full name
				name: `${validatedData.firstName} ${validatedData.lastName}`,
			})
			.where(eq(user.id, currentUser.id))
			.returning();

		// Log profile update to Discord (only for significant changes)
		const newFullName = `${validatedData.firstName} ${validatedData.lastName}`;
		const hasNameChange = currentUser.name !== newFullName;

		if (hasNameChange) {
			await logger.info('Profile Updated', 'User updated their profile name', {
				userId: currentUser.id,
				oldName: currentUser.name || 'Unknown',
				newName: newFullName,
				email: currentUser.email,
			});
		}

		revalidatePath('/settings');
		return { success: true };
	} catch (error) {
		console.error('Profile update error:', error);

		// Log profile update error
		await logger.error(
			'Profile Update Failed',
			'User profile update encountered an error',
			{
				userId: currentUser.id,
				userName: currentUser.name || currentUser.email,
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		);

		if (error instanceof z.ZodError) {
			return { error: error.errors[0].message };
		}
		return { error: 'Failed to update profile' };
	}
}

/**
 * Handles soft deletion of a user account
 */
export async function deactivateUserAccount(formData: FormData) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: 'Unauthorized' };
	}

	try {
		const password = formData.get('password');
		if (!password || typeof password !== 'string') {
			return { error: 'Password is required' };
		}

		const email = formData.get('email');
		if (!email || typeof email !== 'string' || email !== currentUser.email) {
			return { error: "Email address doesn't match your account" };
		}

		// Password verification would be done here
		// This is a placeholder for actual password verification

		await db
			.update(user)
			.set({
				deletedAt: new Date().toISOString(),
				// Store scheduled deletion date in database
				// This record is used by a cleanup job to permanently delete after grace period (ensuring user has time to cancel)
			})
			.where(eq(user.id, currentUser.id));

		// Log account deactivation - this is a critical security event
		await logger.warning(
			'Account Deactivated',
			'User account was deactivated and scheduled for deletion',
			{
				userId: currentUser.id,
				userName: currentUser.name || currentUser.email,
				email: currentUser.email,
				deactivatedAt: new Date().toISOString(),
			}
		);

		revalidatePath('/settings');
		return { success: true };
	} catch (error) {
		console.error('Account deletion error:', error);

		// Log account deactivation error
		await logger.error(
			'Account Deactivation Failed',
			'Account deactivation process encountered an error',
			{
				userId: currentUser.id,
				userName: currentUser.name || currentUser.email,
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		);

		return { error: 'Failed to process account deletion' };
	}
}
