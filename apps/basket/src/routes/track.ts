import {
	getWebsiteByIdV2,
	isOriginAllowed,
	resolveApiKeyOwnerId,
} from "@hooks/auth";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasGlobalAccess,
	hasKeyScope,
} from "@lib/api-key";
import { checkAutumnUsage } from "@lib/billing";
import { insertCustomEvents } from "@lib/event-service";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { getWebsiteSecuritySettings } from "@lib/request-validation";
import { summarizeRejectedBody } from "@lib/rejection-summary";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import {
	extractTrustedClientIp,
	getVisitorCountryForAutoMode,
} from "@utils/ip-geo";
import { isValidIpFromSettings } from "@utils/origin-ip-validation";
import { VALIDATION_LIMITS, validatePayloadSize } from "@utils/validation";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { trackEventSchema } from "./track-event-schema";

interface ResolvedAuth {
	apiKey?: ApiKeyRow;
	organizationId?: string;
	ownerId: string;
	websiteId?: string;
}

function json(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function parseTimestamp(
	value: number | string | Date | undefined,
	fallback: number
): number {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw basketErrors.trackInvalidBody();
		}
		return value;
	}
	if (value instanceof Date) {
		const timestamp = value.getTime();
		if (!Number.isFinite(timestamp)) {
			throw basketErrors.trackInvalidBody();
		}
		return timestamp;
	}
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) {
		throw basketErrors.trackInvalidBody();
	}
	return timestamp;
}

async function enforceWebsiteSecurity(
	website: NonNullable<Awaited<ReturnType<typeof getWebsiteByIdV2>>>,
	request: Request,
	websiteIdParam: string
): Promise<void> {
	const log = useLogger();

	if (website.status !== "ACTIVE") {
		log.set({
			auth: {
				ok: false,
				reason: "website_not_active",
				websiteId: websiteIdParam,
				status: website.status,
			},
		});
		throw basketErrors.trackWebsiteNotFound();
	}

	const origin = request.headers.get("origin");
	const settings = getWebsiteSecuritySettings(website.settings);
	const allowedOrigins = settings?.allowedOrigins;
	const allowedIps = settings?.allowedIps;

	if (allowedOrigins?.length && !origin) {
		log.set({
			auth: {
				ok: false,
				reason: "origin_missing",
				expectedDomain: website.domain,
				allowedOrigins,
			},
		});
		throw basketErrors.ingestOriginNotAuthorized();
	}

	if (origin && !isOriginAllowed(origin, website.domain, allowedOrigins)) {
		log.set({
			auth: {
				ok: false,
				reason: "origin_not_authorized",
				origin,
				expectedDomain: website.domain,
				allowedOrigins,
			},
		});
		throw basketErrors.ingestOriginNotAuthorized();
	}

	if (allowedIps && allowedIps.length > 0) {
		const ip = extractTrustedClientIp(request);
		if (!(ip && (await isValidIpFromSettings(ip, allowedIps)))) {
			log.set({ auth: { ok: false, reason: "ip_not_authorized" } });
			throw basketErrors.ingestIpNotAuthorized();
		}
	}
}

function resolveAuth(
	headers: Headers,
	request: Request,
	websiteIdParam?: string
): Promise<ResolvedAuth> {
	return record("resolveAuth", async () => {
		const log = useLogger();
		const apiKey = await getApiKeyFromHeader(headers);

		if (apiKey) {
			if (!hasKeyScope(apiKey, "track:events")) {
				log.set({
					auth: { ok: false, reason: "missing_scope", method: "api_key" },
				});
				throw basketErrors.trackMissingScope();
			}

			const ownerId = apiKey.organizationId ?? apiKey.userId;
			if (!ownerId) {
				log.set({
					auth: { ok: false, reason: "missing_owner", method: "api_key" },
				});
				throw basketErrors.trackMissingOwner();
			}

			log.set({
				auth: {
					ok: true,
					method: "api_key",
					organizationId: apiKey.organizationId ?? undefined,
				},
			});
			return {
				ownerId,
				apiKey,
				organizationId: apiKey.organizationId ?? undefined,
			};
		}

		if (!websiteIdParam) {
			log.set({ auth: { ok: false, reason: "no_credentials" } });
			throw basketErrors.trackMissingCredentials();
		}

		const website = await getWebsiteByIdV2(websiteIdParam);
		if (!website) {
			log.set({
				auth: {
					ok: false,
					reason: "website_not_found",
					websiteId: websiteIdParam,
				},
			});
			throw basketErrors.trackWebsiteNotFound();
		}

		if (!website.organizationId) {
			log.set({
				auth: {
					ok: false,
					reason: "no_organization",
					websiteId: websiteIdParam,
				},
			});
			throw basketErrors.trackWebsiteNoOrganization();
		}

		await enforceWebsiteSecurity(website, request, websiteIdParam);

		log.set({
			auth: {
				ok: true,
				method: "website_id",
				websiteId: websiteIdParam,
				organizationId: website.organizationId,
			},
		});
		return {
			ownerId: website.organizationId,
			websiteId: websiteIdParam,
			organizationId: website.organizationId,
		};
	});
}

export const trackRoute = new Elysia().post(
	"/track",
	async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "track" });
		const typedBody = body as unknown;
		const typedQuery = query as Record<string, string>;

		const captureRejectedBody = () => {
			const summary = summarizeRejectedBody(typedBody);
			if (summary) {
				log.set(summary);
			}
		};

		try {
			if (!validatePayloadSize(typedBody, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
				log.set({ rejected: "payload_too_large" });
				captureRejectedBody();
				throw basketErrors.trackPayloadTooLarge();
			}

			const parseResult = trackEventSchema.safeParse(typedBody);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				captureRejectedBody();
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			const events = Array.isArray(parseResult.data)
				? parseResult.data
				: [parseResult.data];
			const websiteIdParam = typedQuery.website_id || events[0]?.websiteId;

			const auth = await resolveAuth(request.headers, request, websiteIdParam);

			log.set({
				ownerId: auth.ownerId,
				websiteId: auth.websiteId,
				count: events.length,
			});

			const rateLimitPrincipal = auth.apiKey
				? `track:apikey:${auth.apiKey.id}`
				: `track:website:${auth.websiteId ?? "unknown"}:${
						extractTrustedClientIp(request) ?? "anon"
					}`;
			const rl = await ratelimit(rateLimitPrincipal, 600, 60);
			if (!rl.success) {
				log.set({ rejected: "rate_limit" });
				captureRejectedBody();
				throw basketErrors.trackRateLimited();
			}

			const billingUserId = auth.organizationId
				? await resolveApiKeyOwnerId(auth.organizationId)
				: auth.ownerId;

			if (billingUserId) {
				await checkAutumnUsage(
					billingUserId,
					"events",
					{ api_route: "track", batch_size: events.length },
					events.length
				);
			}

			const allowedApiKeyWebsiteIds =
				auth.apiKey && !hasGlobalAccess(auth.apiKey)
					? new Set(getAccessibleWebsiteIds(auth.apiKey))
					: null;

			for (const event of events) {
				const targetId = event.websiteId ?? auth.websiteId;

				if (auth.apiKey) {
					if (
						targetId &&
						allowedApiKeyWebsiteIds &&
						!allowedApiKeyWebsiteIds.has(targetId)
					) {
						log.set({ rejected: "website_scope", targetWebsiteId: targetId });
						captureRejectedBody();
						throw basketErrors.trackWebsiteScopeMismatch();
					}
					continue;
				}

				if (!targetId) {
					captureRejectedBody();
					throw basketErrors.trackInvalidBody();
				}

				if (auth.websiteId && targetId !== auth.websiteId) {
					log.set({ rejected: "website_scope", targetWebsiteId: targetId });
					captureRejectedBody();
					throw basketErrors.trackWebsiteScopeMismatch();
				}
			}

			const now = Date.now();
			const spans = events.map((event) => ({
				owner_id: auth.ownerId,
				website_id: event.websiteId ?? auth.websiteId,
				timestamp: parseTimestamp(event.timestamp, now),
				event_name: event.name,
				namespace: event.namespace,
				properties: event.properties,
				anonymous_id: event.anonymousId,
				anonymizeVisitorIds: event.anonymizeVisitorIds,
				session_id: event.sessionId,
				source: event.source,
			}));

			const visitorCountry = await getVisitorCountryForAutoMode(spans, request);
			await insertCustomEvents(spans, visitorCountry);

			return json(
				{ status: "success", type: "custom_event", count: spans.length },
				200
			);
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	}
);
