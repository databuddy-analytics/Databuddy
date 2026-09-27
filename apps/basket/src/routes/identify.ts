import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	splitTraits,
	upsertAlias,
	upsertProfile,
} from "@databuddy/services/identity";
import { identifyPayloadSchema } from "@databuddy/validation";
import { getWebsiteByIdV2 } from "@hooks/auth";
import {
	API_KEY_DENIAL_ERRORS,
	denyApiKeyWebsiteAccess,
	getApiKeyFromHeader,
} from "@lib/api-key";
import { checkForBot, validateRequest } from "@lib/request-validation";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { sanitizeString, VALIDATION_LIMITS } from "@utils/validation";
import { Elysia } from "elysia";
import { parseError } from "evlog";
import { useLogger } from "evlog/elysia";

type IdentifyTarget =
	| {
			websiteId: string;
			rateLimitPrincipal: string;
			rateLimitPerMinute: number;
	  }
	| { botResponse: unknown };

export function normalizeIdentifyProfileId(profileId: string): string {
	return sanitizeString(profileId, VALIDATION_LIMITS.USER_ID_MAX_LENGTH);
}

async function resolveIdentifyTarget(
	body: unknown,
	query: unknown,
	request: Request,
	websiteIdFromBody: string | undefined
): Promise<IdentifyTarget> {
	const log = useLogger();
	const apiKey = await getApiKeyFromHeader(request.headers);

	if (apiKey) {
		const website = websiteIdFromBody
			? await getWebsiteByIdV2(websiteIdFromBody)
			: null;
		const denial = denyApiKeyWebsiteAccess(apiKey, websiteIdFromBody, website);
		if (denial) {
			log.set({ rejected: denial });
			throw API_KEY_DENIAL_ERRORS[denial]();
		}
		log.set({ auth: { method: "api_key" }, websiteId: websiteIdFromBody });
		return {
			websiteId: websiteIdFromBody as string,
			rateLimitPrincipal: `identify:apikey:${apiKey.id}`,
			rateLimitPerMinute: 600,
		};
	}

	const { clientId, userAgent, ip } = await validateRequest(
		body,
		query,
		request,
		{ checkUsage: false }
	);
	log.set({ clientId });

	const botError = await checkForBot(request, body, query, clientId, userAgent);
	if (botError) {
		log.set({ identify_outcome: "blocked", http_status: 204, rejected: "bot" });
		return { botResponse: botError.error };
	}

	return {
		websiteId: clientId,
		rateLimitPrincipal: `identify:${clientId}:${ip}`,
		rateLimitPerMinute: 60,
	};
}

export const identifyRoute = new Elysia().post(
	"/identify",
	async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "identify" });

		try {
			const parseResult = identifyPayloadSchema.safeParse(body);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			const target = await resolveIdentifyTarget(
				body,
				query,
				request,
				parseResult.data.websiteId
			);
			if ("botResponse" in target) {
				return target.botResponse;
			}
			const { websiteId, rateLimitPrincipal, rateLimitPerMinute } = target;

			const rl = await ratelimit(rateLimitPrincipal, rateLimitPerMinute, 60);
			if (!rl.success) {
				log.set({ rejected: "rate_limit" });
				throw basketErrors.identifyRateLimited();
			}

			const profileId = normalizeIdentifyProfileId(parseResult.data.profileId);
			if (!profileId) {
				log.set({ rejected: "profile_id" });
				throw createIngestSchemaValidationError([
					{
						code: "custom",
						path: ["profileId"],
						message: "profileId must contain a valid identifier",
					},
				]);
			}
			const { anonymousId, traits } = parseResult.data;
			log.set({
				traitCount: Object.keys(traits ?? {}).length,
				hasAlias: Boolean(anonymousId),
				canonicalized_profile_id: profileId !== parseResult.data.profileId,
			});

			const [update] = await Promise.all([
				record("upsertProfile", () =>
					upsertProfile(websiteId, profileId, splitTraits(traits))
				),
				anonymousId
					? record("upsertAlias", () =>
							upsertAlias(websiteId, anonymousId, profileId)
						)
					: Promise.resolve(),
			]);

			if (update && update.changes.length > 0) {
				log.set({ traitChanges: update.changes.length });
			}
			log.set({ identify_outcome: "success", http_status: 200 });

			return Response.json({ status: "success", type: "identify" });
		} catch (error) {
			const parsed = parseError(error);
			log.set({
				identify_outcome: "rejected",
				http_status: parsed.status,
				failure_reason: parsed.code,
			});
			rethrowOrWrap(error, log);
		}
	}
);
