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

		const secret = process.env.DATABUDDY_ENCRYPTION_KEY;
		if (
			secret &&
			isAiDigestUnsubscribeToken(query.organization, query.token, secret)
		) {
			await db
				.update(organization)
				.set({
					emailNotifications: sql`${organization.emailNotifications} || jsonb_build_object('aiAgents', coalesce(${organization.emailNotifications} -> 'aiAgents', '{}'::jsonb) || '{"weeklyDigest": false}'::jsonb)`,
				})
				.where(eq(organization.id, query.organization));
			return { success: true };
		}

		const clientIp = getClientIp(request.headers) ?? "unknown";
		const rl = await ratelimit(`email-unsubscribe:ip:${clientIp}`, 30, 3600);
		for (const [key, value] of Object.entries(getRateLimitHeaders(rl))) {
			set.headers[key] = value;
		}
		mergeWideEvent({
			email_unsubscribe_rejected: rl.success ? "invalid_token" : "rate_limit",
		});
		set.status = rl.success ? 403 : 429;
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
