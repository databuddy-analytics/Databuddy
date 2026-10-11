"use server";

import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { account } from "@databuddy/db/schema";
import { APIError } from "better-auth/api";
import { useLogger } from "evlog/next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { withEvlog } from "@/lib/evlog";

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

export const setPasswordForOAuthUser = withEvlog(
	async (newPassword: string) => {
		const log = useLogger();
		log.set({ action: "set_password_for_oauth_user" });
		const currentUser = await getUser();
		if (!currentUser) {
			return { error: "Unauthorized" };
		}
		log.set({ user: { id: currentUser.id } });
		const actor = { type: "user", id: currentUser.id } as const;

		const passwordResult = passwordSchema.safeParse(newPassword);
		if (!passwordResult.success) {
			return { error: passwordResult.error.message };
		}

		let passwordSaved = false;
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

			const requestHeaders = await headers();
			await auth.api.setPassword({
				body: { newPassword },
				headers: requestHeaders,
			});
			passwordSaved = true;
			log.audit?.({ action: "auth.set_password", actor, outcome: "success" });
			await auth.api.revokeOtherSessions({ headers: requestHeaders });

			revalidatePath("/settings");
			return { success: true };
		} catch (error) {
			log.error(error instanceof Error ? error : String(error));
			if (!passwordSaved) {
				log.audit?.({
					action: "auth.set_password",
					actor,
					outcome: "failure",
					reason:
						error instanceof APIError
							? ((error.body as { code?: string } | undefined)?.code ??
								String(error.status))
							: "unexpected",
				});
			}
			if (error instanceof APIError) {
				return { error: error.message };
			}
			return { error: "We couldn't set your password. Try again in a moment." };
		}
	}
);
