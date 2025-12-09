"use server";

import { auth } from "@databuddy/auth";
import { account, and, db, eq, user } from "@databuddy/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { z } from "zod";

const getUser = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return null;
	}
	return session.user;
});

const profileUpdateSchema = z.object({
	firstName: z
		.string()
		.min(1, "First name is required")
		.max(50, "First name cannot exceed 50 characters"),
	lastName: z
		.string()
		.min(1, "Last name is required")
		.max(50, "Last name cannot exceed 50 characters"),
	image: z.url("Please enter a valid image URL").optional(),
});

const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.max(128, "Password cannot exceed 128 characters");

export async function updateUserProfile(formData: FormData) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: "Unauthorized" };
	}

	try {
		const firstName = formData.get("firstName");
		const lastName = formData.get("lastName");
		const image = formData.get("image");

		const validatedData = profileUpdateSchema.parse({
			firstName,
			lastName,
			image: image || undefined,
		});

		const _updated = await db
			.update(user)
			.set({
				firstName: validatedData.firstName,
				lastName: validatedData.lastName,
				image: validatedData.image,
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

export async function setPasswordForOAuthUser(newPassword: string) {
	const currentUser = await getUser();
	if (!currentUser) {
		return { error: "Unauthorized" };
	}

	const passwordResult = passwordSchema.safeParse(newPassword);
	if (!passwordResult.success) {
		return { error: passwordResult.error.message };
	}

	try {
		const existingCredentialAccount = await db
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, currentUser.id),
					eq(account.providerId, "credential")
				)
			)
			.limit(1);

		if (existingCredentialAccount.length > 0) {
			return {
				error: "You already have a password. Use change password instead.",
			};
		}

		await auth.api.setPassword({
			body: { newPassword },
			headers: await headers(),
		});

		await auth.api.revokeOtherSessions({
			headers: await headers(),
		});

		revalidatePath("/settings");
		return { success: true };
	} catch (error) {
		console.error("Set password error:", error);
		if (error instanceof Error) {
			return { error: error.message };
		}
		return { error: "Failed to set password" };
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
			})
			.where(eq(user.id, currentUser.id));
		revalidatePath("/settings");
		return { success: true };
	} catch (error) {
		console.error("Account deletion error:", error);
		return { error: "Failed to process account deletion" };
	}
}
