"use server";

import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { account } from "@databuddy/db/schema";
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

const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.max(128, "Password cannot exceed 128 characters");

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
