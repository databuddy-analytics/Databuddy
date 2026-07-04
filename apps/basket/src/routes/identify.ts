import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	splitTraits,
	upsertAlias,
	upsertProfile,
} from "@databuddy/services/identity";
import { identifyPayloadSchema } from "@databuddy/validation";
import { getWebsiteByIdV2 } from "@hooks/auth";
import {
	type ApiKeyRow,
	getApiKeyFromHeader,
	hasWebsiteScope,
} from "@lib/api-key";
import { checkForBot, validateRequest } from "@lib/request-validation";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

export type ApiKeyIdentifyDenial =
	| "missing_website_id"
	| "missing_scope"
	| "website_not_found"
	| "website_scope_mismatch"
	| "website_not_active";

export function denyApiKeyIdentify(
	apiKey: ApiKeyRow,
	websiteId: string | undefined,
	website: { organizationId: string | null; status: string } | null
): ApiKeyIdentifyDenial | null {
	if (!websiteId) {
		return "missing_website_id";
	}
	if (!hasWebsiteScope(apiKey, websiteId, "track:events")) {
		return "missing_scope";
	}
	if (!website) {
		return "website_not_found";
	}
	if (
		!apiKey.organizationId ||
		website.organizationId !== apiKey.organizationId
	) {
		return "website_scope_mismatch";
	}
	if (website.status !== "ACTIVE") {
		return "website_not_active";
	}
	return null;
}

const DENIAL_ERRORS: Record<ApiKeyIdentifyDenial, () => Error> = {
	missing_website_id: basketErrors.identifyMissingWebsiteId,
	missing_scope: basketErrors.trackMissingScope,
	website_not_found: basketErrors.trackWebsiteNotFound,
	website_scope_mismatch: basketErrors.trackWebsiteScopeMismatch,
	website_not_active: basketErrors.trackWebsiteNotFound,
};

type IdentifyTarget =
	| {
			websiteId: string;
			rateLimitPrincipal: string;
			rateLimitPerMinute: number;
	  }
	| { botResponse: unknown };

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
		const denial = denyApiKeyIdentify(apiKey, websiteIdFromBody, website);
		if (denial) {
			log.set({ rejected: denial });
			throw DENIAL_ERRORS[denial]();
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
		request
	);
	log.set({ clientId });

	const botError = await checkForBot(request, body, query, clientId, userAgent);
	if (botError) {
		log.set({ rejected: "bot" });
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

			const { profileId, anonymousId, traits } = parseResult.data;
			log.set({
				traitCount: Object.keys(traits ?? {}).length,
				hasAlias: Boolean(anonymousId),
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

			return Response.json({ status: "success", type: "identify" });
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	}
);
