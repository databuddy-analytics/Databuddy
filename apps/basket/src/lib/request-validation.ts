import {
	getWebsiteByIdV2,
	isValidIpFromSettings,
	isValidOrigin,
	isValidOriginFromSettings,
} from "@hooks/auth";
import { checkAutumnUsage } from "@lib/billing";
import { logBlockedTraffic } from "@lib/blocked-traffic";
import { sendEvent } from "@lib/producer";
import { basketErrors } from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { extractIpFromRequest } from "@utils/ip-geo";
import { detectBot } from "@utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "@utils/validation";
import { useLogger } from "evlog/elysia";

export interface ValidatedRequest {
	clientId: string;
	userAgent: string;
	ip: string;
	ownerId?: string;
	organizationId?: string;
}

interface BillingBlocked {
	error: Response;
}

interface WebsiteSecuritySettings {
	allowedOrigins?: string[];
	allowedIps?: string[];
}

export function getWebsiteSecuritySettings(
	settings: unknown
): WebsiteSecuritySettings | null {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return null;
	}

	const s = settings as Record<string, unknown>;
	return {
		allowedOrigins: Array.isArray(s.allowedOrigins)
			? s.allowedOrigins.filter(
					(item): item is string => typeof item === "string"
				)
			: undefined,
		allowedIps: Array.isArray(s.allowedIps)
			? s.allowedIps.filter((item): item is string => typeof item === "string")
			: undefined,
	};
}

/**
 * Validate incoming request for analytics events.
 * Throws basket ingest EvlogErrors on failure; returns `{ error: billing.response }` when quota is exceeded.
 */
export function validateRequest(
	body: unknown,
	query: unknown,
	request: Request
): Promise<ValidatedRequest | BillingBlocked> {
	return record("validateRequest", async () => {
		const log = useLogger();

		if (!validatePayloadSize(body, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
			logBlockedTraffic(
				request,
				body,
				query,
				"payload_too_large",
				"Validation Error"
			);
			log.set({ validation: { failed: true, reason: "payload_too_large" } });
			throw basketErrors.ingestPayloadTooLarge();
		}

		const queryRecord =
			query && typeof query === "object" && !Array.isArray(query)
				? (query as Record<string, unknown>)
				: {};

		let clientId = sanitizeString(
			queryRecord.client_id,
			VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
		);

		if (!clientId) {
			const headerClientId = request.headers.get("databuddy-client-id");
			if (headerClientId) {
				clientId = sanitizeString(
					headerClientId,
					VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
				);
			}
		}

		if (!clientId) {
			logBlockedTraffic(
				request,
				body,
				query,
				"missing_client_id",
				"Validation Error"
			);
			log.set({ validation: { failed: true, reason: "missing_client_id" } });
			throw basketErrors.ingestMissingClientId();
		}

		log.set({ clientId });

		const website = await record("getWebsiteByIdV2", () =>
			getWebsiteByIdV2(clientId)
		);
		if (!website || website.status !== "ACTIVE") {
			logBlockedTraffic(
				request,
				body,
				query,
				"invalid_client_id",
				"Validation Error",
				undefined,
				clientId
			);
			log.set({
				validation: { failed: true, reason: "invalid_client_id" },
				website: { status: website?.status || "not_found" },
			});
			throw basketErrors.ingestInvalidClientId();
		}

		log.set({ website: { domain: website.domain, status: website.status } });

		if (website.ownerId) {
			const billing = await checkAutumnUsage(website.ownerId, "events", {
				website_domain: website.domain,
				website_id: website.id,
				website_name: website.name,
			});
			if ("exceeded" in billing) {
				logBlockedTraffic(
					request,
					body,
					query,
					"exceeded_event_limit",
					"Validation Error",
					undefined,
					clientId
				);
				return { error: billing.response };
			}
		}

		const origin = request.headers.get("origin");
		const ip = extractIpFromRequest(request);

		const securitySettings = getWebsiteSecuritySettings(website.settings);
		const allowedOrigins = securitySettings?.allowedOrigins;
		const allowedIps = securitySettings?.allowedIps;

		if (origin && allowedOrigins && allowedOrigins.length > 0) {
			if (
				!(await record("isValidOriginFromSettings", () =>
					isValidOriginFromSettings(origin, allowedOrigins)
				))
			) {
				logBlockedTraffic(
					request,
					body,
					query,
					"origin_not_authorized",
					"Security Check",
					undefined,
					clientId
				);
				log.set({
					validation: { failed: true, reason: "origin_not_authorized", origin },
				});
				throw basketErrors.ingestOriginNotAuthorized();
			}
		} else if (
			origin &&
			!(await record("isValidOrigin", () =>
				isValidOrigin(origin, website.domain)
			))
		) {
			logBlockedTraffic(
				request,
				body,
				query,
				"origin_not_authorized",
				"Security Check",
				undefined,
				clientId
			);
			log.set({
				validation: { failed: true, reason: "origin_not_authorized", origin },
			});
			throw basketErrors.ingestOriginNotAuthorized();
		}

		if (
			ip &&
			allowedIps &&
			allowedIps.length > 0 &&
			!(await record("isValidIpFromSettings", () =>
				isValidIpFromSettings(ip, allowedIps)
			))
		) {
			logBlockedTraffic(
				request,
				body,
				query,
				"ip_not_authorized",
				"Security Check",
				undefined,
				clientId
			);
			log.set({ validation: { failed: true, reason: "ip_not_authorized" } });
			throw basketErrors.ingestIpNotAuthorized();
		}

		const userAgent =
			sanitizeString(
				request.headers.get("user-agent"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || "";

		return {
			clientId,
			userAgent,
			ip,
			ownerId: website.ownerId || undefined,
			organizationId: website.organizationId || undefined,
		};
	});
}

/**
 * Check if request is from a bot
 * - ALLOW: Process normally (search engines, social media)
 * - TRACK_ONLY: Log to ai_traffic_spans but don't count as pageview (AI crawlers)
 * - BLOCK: Reject and log to blocked_traffic (scrapers, malicious bots)
 */
export function checkForBot(
	request: Request,
	body: unknown,
	query: unknown,
	clientId: string,
	userAgent: string
): Promise<{ error?: Response } | undefined> {
	return record("checkForBot", () => {
		const log = useLogger();
		const bodyRecord =
			body && typeof body === "object" && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: {};
		const queryRecord =
			query && typeof query === "object" && !Array.isArray(query)
				? (query as Record<string, unknown>)
				: {};

		const botCheck = detectBot(userAgent, request);

		if (!botCheck.isBot) {
			return;
		}

		const { action, result } = botCheck;
		log.set({
			bot: { name: botCheck.botName, category: botCheck.category, action },
		});

		if (action === "allow") {
			return;
		}

		if (action === "track_only") {
			const path =
				(typeof bodyRecord.path === "string" ? bodyRecord.path : undefined) ||
				(typeof bodyRecord.url === "string" ? bodyRecord.url : undefined) ||
				(typeof queryRecord.path === "string" ? queryRecord.path : undefined) ||
				request.headers.get("referer") ||
				"";
			const referrer =
				(typeof bodyRecord.referrer === "string"
					? bodyRecord.referrer
					: undefined) ||
				request.headers.get("referer") ||
				undefined;

			sendEvent("analytics-ai-traffic-spans", {
				client_id: clientId,
				timestamp: Date.now(),
				bot_type: result?.category || "unknown",
				bot_name: botCheck.botName || "unknown",
				user_agent: userAgent,
				path,
				referrer,
				action: "tracked",
			});

			return {
				error: new Response(JSON.stringify({ status: "ignored" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			};
		}

		logBlockedTraffic(
			request,
			body,
			query,
			botCheck.reason || "unknown_bot",
			botCheck.category || "Bot Detection",
			botCheck.botName,
			clientId
		);

		return {
			error: new Response(JSON.stringify({ status: "ignored" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		};
	});
}
