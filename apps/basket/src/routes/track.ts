import { getWebsiteByIdV2, resolveApiKeyOwnerId } from "@hooks/auth";
import { getApiKeyFromHeader, hasKeyScope } from "@lib/api-key";
import { checkAutumnUsage } from "@lib/billing";
import { insertCustomEvents } from "@lib/event-service";
import { basketErrors } from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { VALIDATION_LIMITS, validatePayloadSize } from "@utils/validation";
import { Elysia } from "elysia";
import { createError, EvlogError } from "evlog";
import { useLogger } from "evlog/elysia";
import { z } from "zod";

const trackEventSchema = z.union([
	z.object({
		name: z.string().min(1).max(256),
		namespace: z.string().max(64).optional(),
		timestamp: z.union([z.number(), z.string(), z.date()]).optional(),
		properties: z.record(z.string(), z.unknown()).optional(),
		anonymousId: z.string().max(256).optional(),
		sessionId: z.string().max(256).optional(),
		websiteId: z.uuid().optional(),
		source: z.string().max(64).optional(),
	}),
	z
		.array(
			z.object({
				name: z.string().min(1).max(256),
				namespace: z.string().max(64).optional(),
				timestamp: z.union([z.number(), z.string(), z.date()]).optional(),
				properties: z.record(z.string(), z.unknown()).optional(),
				anonymousId: z.string().max(256).optional(),
				sessionId: z.string().max(256).optional(),
				websiteId: z.uuid().optional(),
				source: z.string().max(64).optional(),
			})
		)
		.max(VALIDATION_LIMITS.BATCH_MAX_SIZE),
]);

interface ResolvedAuth {
	ownerId: string;
	websiteId?: string;
	organizationId?: string;
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
		return value;
	}
	if (value instanceof Date) {
		return value.getTime();
	}
	return new Date(value).getTime();
}

function resolveAuth(
	headers: Headers,
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

		try {
			if (!validatePayloadSize(typedBody, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
				log.set({ rejected: "payload_too_large" });
				throw basketErrors.trackPayloadTooLarge();
			}

			const parseResult = trackEventSchema.safeParse(typedBody);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				throw basketErrors.trackInvalidBody();
			}

			const events = Array.isArray(parseResult.data)
				? parseResult.data
				: [parseResult.data];
			const websiteIdParam = typedQuery.website_id || events[0]?.websiteId;

			const auth = await resolveAuth(request.headers, websiteIdParam);

			log.set({
				ownerId: auth.ownerId,
				websiteId: auth.websiteId,
				count: events.length,
			});

			const billingUserId = auth.organizationId
				? await resolveApiKeyOwnerId(auth.organizationId)
				: auth.ownerId;

			if (billingUserId) {
				const billing = await checkAutumnUsage(billingUserId, "events", {
					api_route: "track",
				});
				if ("exceeded" in billing) {
					log.set({ rejected: "billing_exceeded" });
					return billing.response;
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
				session_id: event.sessionId,
				source: event.source,
			}));

			await insertCustomEvents(spans);

			return json(
				{ status: "success", type: "custom_event", count: spans.length },
				200
			);
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			log.error(err);
			throw createError({
				message: "Internal server error",
				status: 500,
				why: process.env.NODE_ENV === "development" ? err.message : undefined,
				cause: err,
			});
		}
	}
);
