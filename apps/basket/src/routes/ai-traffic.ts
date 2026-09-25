import type { AiTrafficSpansInsert } from "@databuddy/db/clickhouse/tables";
import { getWebsiteByIdV2 } from "@hooks/auth";
import { verifyAiAgent } from "@lib/ai-agent-verification";
import {
	API_KEY_DENIAL_ERRORS,
	denyApiKeyWebsiteAccess,
	getApiKeyFromHeader,
} from "@lib/api-key";
import { parseCorsSafeJson } from "@lib/cors-safe-json";
import { runFork, send } from "@lib/producer";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { detectBot } from "@utils/user-agent";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { z } from "zod";

const agentHitSchema = z.object({
	websiteId: z.string().min(1).max(128),
	path: z.string().max(2048),
	userAgent: z.string().min(1).max(512),
	ip: z.string().max(64),
	referrer: z.string().max(2048).optional(),
});

export const aiTrafficRoute = new Elysia()
	.onParse(parseCorsSafeJson)
	.post("/ai-traffic", async ({ body, request }) => {
		const log = useLogger();
		log.set({ route: "ai-traffic" });

		try {
			const apiKey = await getApiKeyFromHeader(request.headers);
			if (!apiKey) {
				throw basketErrors.trackMissingCredentials();
			}

			const parsed = agentHitSchema.safeParse(body);
			if (!parsed.success) {
				throw createIngestSchemaValidationError(parsed.error.issues);
			}
			const hit = parsed.data;
			log.set({ websiteId: hit.websiteId });

			const website = await getWebsiteByIdV2(hit.websiteId);
			const denial = denyApiKeyWebsiteAccess(apiKey, hit.websiteId, website);
			if (denial) {
				log.set({ rejected: denial });
				throw API_KEY_DENIAL_ERRORS[denial]();
			}

			const { botName, result } = detectBot(hit.userAgent, request);
			const agent = result?.agent;
			if (!agent) {
				log.set({ rejected: "not_ai_agent" });
				return new Response(null, { status: 204 });
			}

			const verification = await verifyAiAgent(agent.id, hit.ip);
			log.set({
				bot: {
					name: botName,
					agent: agent.id,
					purpose: agent.purpose,
					verification,
				},
			});

			const span: AiTrafficSpansInsert = {
				client_id: hit.websiteId,
				timestamp: Date.now(),
				bot_type: result.category ?? "unknown",
				bot_name: botName ?? agent.operator,
				user_agent: hit.userAgent,
				path: hit.path,
				referrer: hit.referrer,
				agent_id: agent.id,
				agent_purpose: agent.purpose,
				verification,
				source: "middleware",
			};
			runFork(send("analytics-ai-traffic-spans", span));

			return new Response(null, { status: 202 });
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	});
