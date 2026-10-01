import { mergeWideEvent } from "@databuddy/ai/lib/tracing";
import {
	db,
	eq,
	isAiDigestUnsubscribeToken,
	organization,
	sql,
} from "@databuddy/db";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import { Elysia, t } from "elysia";

export const emailUnsubscribeRoute = new Elysia({
	prefix: "/v1/email-unsubscribe",
}).post(
	"/ai-digest",
	async function unsubscribeFromAiDigest({ query, request, set }) {
		mergeWideEvent({
			email_unsubscribe: "ai_digest",
			email_unsubscribe_organization: query.organization,
		});

		const clientIp = getClientIp(request.headers) ?? "unknown";
		const rl = await ratelimit(`email-unsubscribe:ip:${clientIp}`, 30, 3600);
		for (const [key, value] of Object.entries(getRateLimitHeaders(rl))) {
			set.headers[key] = value;
		}
		if (!rl.success) {
			mergeWideEvent({ email_unsubscribe_rejected: "rate_limit" });
			set.status = 429;
			return { success: false };
		}

		const secret = process.env.DATABUDDY_ENCRYPTION_KEY;
		if (
			!(
				secret &&
				isAiDigestUnsubscribeToken(query.organization, query.token, secret)
			)
		) {
			mergeWideEvent({ email_unsubscribe_rejected: "invalid_token" });
			set.status = 403;
			return { success: false };
		}

		await db
			.update(organization)
			.set({
				emailNotifications: sql`${organization.emailNotifications} || jsonb_build_object('aiAgents', coalesce(${organization.emailNotifications} -> 'aiAgents', '{}'::jsonb) || '{"weeklyDigest": false}'::jsonb)`,
			})
			.where(eq(organization.id, query.organization));
		return { success: true };
	},
	{
		query: t.Object({
			organization: t.String({ maxLength: 128, minLength: 1 }),
			token: t.String({ maxLength: 128, minLength: 1 }),
		}),
	}
);
