import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	db,
	eq,
	isAiDigestUnsubscribeToken,
	mergeEmailNotificationSettings,
	organization,
} from "@databuddy/db";
import { Elysia, t } from "elysia";

export const emailUnsubscribeRoute = new Elysia({
	prefix: "/v1/email-unsubscribe",
}).post(
	"/ai-digest",
	async function unsubscribeFromAiDigest({ query, set }) {
		mergeWideEvent({
			email_unsubscribe: "ai_digest",
			email_unsubscribe_organization: query.organization,
		});

		const secret = process.env.DATABUDDY_ENCRYPTION_KEY;
		if (
			secret &&
			isAiDigestUnsubscribeToken(query.organization, query.token, secret)
		) {
			await db
				.update(organization)
				.set({
					emailNotifications: mergeEmailNotificationSettings({
						aiAgents: { weeklyDigest: false },
					}),
				})
				.where(eq(organization.id, query.organization));
			return { success: true };
		}

		mergeWideEvent({ email_unsubscribe_rejected: "invalid_token" });
		set.status = 403;
		return { success: false };
	},
	{
		body: t.Object({ "List-Unsubscribe": t.Literal("One-Click") }),
		query: t.Object({
			organization: t.String({ maxLength: 128, minLength: 1 }),
			token: t.String({ maxLength: 128, minLength: 1 }),
		}),
	}
);
