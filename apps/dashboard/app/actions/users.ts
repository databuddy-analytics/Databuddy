"use server";

import { auth } from "@databuddy/auth";
import { db, eq, user } from "@databuddy/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { z } from "zod";

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
		.min(1, "First name is required")
		.max(50, "First name cannot exceed 50 characters"),
	lastName: z
		.string()
		.min(1, "Last name is required")
		.max(50, "Last name cannot exceed 50 characters"),
	image: z.string().url("Please enter a valid image URL").optional(),
});

/**
 * Updates the user's profile information
 */
export async function updateUserProfile(formData: FormData) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: "Unauthorized" };
	}

	try {
		// Parse and validate form data
		const firstName = formData.get("firstName");
		const lastName = formData.get("lastName");
		const image = formData.get("image");

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

		revalidatePath("/settings");
		return { success: true };
	} catch (error) {
		console.error("Profile update error:", error);

		if (error instanceof z.ZodError) {
			return { error: error.message };
		}
		return { error: "Failed to update profile" };
	}
}

/**
 * Handles soft deletion of a user account
 */
export async function deactivateUserAccount(formData: FormData) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: "Unauthorized" };
	}

	try {
		const password = formData.get("password");
		if (!password || typeof password !== "string") {
			return { error: "Password is required" };
		}

		const email = formData.get("email");
		if (!email || typeof email !== "string" || email !== currentUser.email) {
			return { error: "Email address doesn't match your account" };
		}
		await db
			.update(user)
			.set({
				deletedAt: new Date().toISOString(),
				// Store scheduled deletion date in database
				// This record is used by a cleanup job to permanently delete after grace period (ensuring user has time to cancel)
			})
			.where(eq(user.id, currentUser.id));
		revalidatePath("/settings");
		return { success: true };
	} catch (error) {
		console.error("Account deletion error:", error);
		return { error: "Failed to process account deletion" };
	}
}
