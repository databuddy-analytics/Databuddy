'use server';

import { auth } from '@databuddy/auth';
import { headers } from 'next/headers';
import { z } from 'zod';

const setPasswordSchema = z
	.object({
		password: z.string().min(8, {
			message: 'Password must be at least 8 characters long.',
		}),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match.',
		path: ['confirmPassword'],
	});

export async function setPassword(formData: FormData) {
	const user = await auth.api.getSession({ headers: await headers() });

	if (!user) {
		return { success: false, message: 'User not found.' };
	}

	const result = setPasswordSchema.safeParse({
		password: formData.get('password'),
		confirmPassword: formData.get('confirmPassword'),
	});

	if (!result.success) {
		return { success: false, message: result.error.message };
	}

	try {
		const response = await auth.api.setPassword({
			headers: await headers(),
			body: { newPassword: result.data.password },
		});

		if (!response.status) {
			return { success: false, message: 'Failed to set password.' };
		}

		return { success: true, message: 'Password updated successfully.' };
	} catch (error) {
		console.error(error);
		return {
			success: false,
			message: 'An error occurred while setting your password.',
		};
	}
}
