import type { AiTrafficSpansInsert } from "@databuddy/db/clickhouse/tables";
import { detectBot } from "@databuddy/shared/bot-detection";
import {
	type AgentSignals,
	agentBotCategory,
	identifyAiAgent,
} from "@databuddy/shared/bot-detection/ai-agents";
import {
	getWebsiteByIdV2,
	isOriginAllowed,
	isValidIpFromSettings,
} from "@hooks/auth";
import { checkAutumnUsage } from "@lib/billing";
import { logBlockedTraffic } from "@lib/blocked-traffic";
import { runFork, send } from "@lib/producer";
import { basketErrors } from "@lib/structured-errors";
import { record } from "@lib/tracing";
import { extractAllowlistClientIp, extractIpFromRequest } from "@utils/ip-geo";
import {
	sanitizeString,
	sanitizeUrl,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "@utils/validation";
import { useLogger } from "evlog/elysia";

interface ValidatedRequest {
	clientId: string;
	ip: string;
	organizationId?: string;
	ownerId?: string;
	userAgent: string;
}

interface WebsiteSecuritySettings {
	allowedIps?: string[];
	allowedOrigins?: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
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

export function validateRequest(
	body: unknown,
	query: unknown,
	request: Request,
	options: { checkUsage?: boolean } = {}
): Promise<ValidatedRequest> {
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

		const queryRecord = asRecord(query);

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

		const sdkName = request.headers.get("databuddy-sdk-name");
		const sdkVersion = request.headers.get("databuddy-sdk-version");
		if (sdkName) {
			log.set({ sdk_name: sdkName, sdk_version: sdkVersion });
		}

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

		const userAgent =
			sanitizeString(
				request.headers.get("user-agent"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || "";

		const bot = detectBot(userAgent);
		const isBlockedBot = bot.isBot && bot.action !== "allow";

		if (website.ownerId && options.checkUsage !== false && !isBlockedBot) {
			const eventCount = Array.isArray(body)
				? Math.min(Math.max(body.length, 1), VALIDATION_LIMITS.BATCH_MAX_SIZE)
				: 1;
			await checkAutumnUsage(
				website.ownerId,
				"events",
				{
					website_domain: website.domain,
					website_id: website.id,
					website_name: website.name,
				},
				eventCount
			);
		}

		const origin = request.headers.get("origin");
		const ip = extractIpFromRequest(request);

		const securitySettings = getWebsiteSecuritySettings(website.settings);
		const allowedOrigins = securitySettings?.allowedOrigins;
		const allowedIps = securitySettings?.allowedIps;
		const blockedAlertContext = {
			organizationId: website.organizationId,
			ownerId: website.ownerId,
			websiteDomain: website.domain,
			websiteName: website.name,
		};

		if (allowedOrigins?.length && !origin) {
			logBlockedTraffic(
				request,
				body,
				query,
				"origin_missing",
				"Security Check",
				undefined,
				clientId,
				blockedAlertContext
			);
			log.set({
				validation: {
					failed: true,
					reason: "origin_missing",
					expectedDomain: website.domain,
					allowedOrigins,
				},
			});
			throw basketErrors.ingestOriginNotAuthorized();
		}

		if (origin && !isOriginAllowed(origin, website.domain, allowedOrigins)) {
			logBlockedTraffic(
				request,
				body,
				query,
				"origin_not_authorized",
				"Security Check",
				undefined,
				clientId,
				blockedAlertContext
			);
			log.set({
				validation: {
					failed: true,
					reason: "origin_not_authorized",
					origin,
					expectedDomain: website.domain,
					allowedOrigins,
				},
			});
			throw basketErrors.ingestOriginNotAuthorized();
		}

		if (allowedIps && allowedIps.length > 0) {
			const trustedIp = extractAllowlistClientIp(request);
			const isAllowed =
				trustedIp &&
				(await record("isValidIpFromSettings", () =>
					isValidIpFromSettings(trustedIp, allowedIps)
				));

			if (!isAllowed) {
				logBlockedTraffic(
					request,
					body,
					query,
					"ip_not_authorized",
					"Security Check",
					undefined,
					clientId,
					blockedAlertContext
				);
				log.set({ validation: { failed: true, reason: "ip_not_authorized" } });
				throw basketErrors.ingestIpNotAuthorized();
			}
		}

		return {
			clientId,
			userAgent,
			ip,
			ownerId: website.ownerId || undefined,
			organizationId: website.organizationId || undefined,
		};
	});
}

export function checkForBot(
	request: Request,
	body: unknown,
	query: unknown,
	clientId: string,
	userAgent: string
): Promise<{ isTrackOnly: boolean; response: Response } | undefined> {
	return record("checkForBot", () => {
		const bot = detectBot(userAgent);
		if (!bot.isBot) {
			return;
		}

		useLogger().set({
			bot: {
				name: bot.name,
				category: bot.category,
				action: bot.action,
				agent: bot.agent?.id,
				purpose: bot.agent?.purpose,
			},
		});

		if (bot.action === "allow") {
			return;
		}

		const isTrackOnly = bot.action === "track_only";
		if (!isTrackOnly) {
			logBlockedTraffic(
				request,
				body,
				query,
				bot.reason,
				"Known Bot",
				bot.name,
				clientId
			);
		}

		return { response: new Response(null, { status: 204 }), isTrackOnly };
	});
}

export function agentSpanColumns(signals: AgentSignals) {
	const bot = detectBot(signals.userAgent);
	const agent = identifyAiAgent(signals, bot.category);
	return {
		agent_id: agent?.id ?? "",
		agent_purpose: agent?.purpose ?? "",
		bot_name: agent?.name ?? bot.name ?? "",
		bot_type: agent ? agentBotCategory(agent) : (bot.category ?? "unknown"),
	};
}

export function recordAiPageView(
	event: unknown,
	clientId: string,
	userAgent: string
): void {
	const { name, path, referrer } = asRecord(event);
	if (name !== "screen_view") {
		return;
	}
	runFork(
		send("analytics-ai-traffic-spans", {
			...agentSpanColumns({ userAgent }),
			client_id: clientId,
			timestamp: Date.now(),
			user_agent: userAgent,
			path: sanitizeUrl(path, VALIDATION_LIMITS.STRING_MAX_LENGTH),
			referrer:
				sanitizeUrl(referrer, VALIDATION_LIMITS.STRING_MAX_LENGTH) || null,
			source: "tracker",
			format: "html",
		} satisfies AiTrafficSpansInsert)
	);
}
