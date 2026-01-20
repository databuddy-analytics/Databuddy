import { getWebsiteByIdV2, isValidOrigin } from "@hooks/auth";
import { logBlockedTraffic } from "@lib/blocked-traffic";
import { sendEvent } from "@lib/producer";
import { captureError, record, setAttributes } from "@lib/tracing";
import { extractIpFromRequest } from "@utils/ip-geo";
import { detectBot } from "@utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "@utils/validation";
import { Autumn as autumn } from "autumn-js";

interface ValidationResult {
	success: boolean;
	clientId: string;
	userAgent: string;
	ip: string;
	ownerId?: string;
}

interface ValidationError {
	error: Response;
}

/**
 * Validate incoming request for analytics events
 */
export function validateRequest(
	body: any,
	query: any,
	request: Request
): Promise<ValidationResult | ValidationError> {
	return record("validateRequest", async () => {
		if (!validatePayloadSize(body, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
			logBlockedTraffic(
				request,
				body,
				query,
				"payload_too_large",
				"Validation Error"
			);
			setAttributes({
				validation_failed: true,
				validation_reason: "payload_too_large",
			});
			return {
				error: new Response(
					JSON.stringify({ status: "error", message: "Payload too large" }),
					{
						status: 413,
						headers: { "Content-Type": "application/json" },
					}
				),
			};
		}

		let clientId = sanitizeString(
			query.client_id,
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
			setAttributes({
				validation_failed: true,
				validation_reason: "missing_client_id",
			});
			return {
				error: new Response(
					JSON.stringify({ status: "error", message: "Missing client ID" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				),
			};
		}

		setAttributes({
			client_id: clientId,
		});

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
			setAttributes({
				validation_failed: true,
				validation_reason: "invalid_client_id",
				website_status: website?.status || "not_found",
			});
			return {
				error: new Response(
					JSON.stringify({
						status: "error",
						message: "Invalid or inactive client ID",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					}
				),
			};
		}

		setAttributes({
			website_domain: website.domain,
			website_status: website.status,
		});

		if (website.ownerId) {
			try {
				const result = await record("autumn.check", () =>
					autumn.check({
						customer_id: website.ownerId || "",
						feature_id: "events",
						send_event: true,
						// @ts-expect-error autumn types are not up to date
						properties: {
							website_domain: website.domain,
							website_id: website.id,
							website_name: website.name,
						},
					})
				);
				const data = result.data;

				if (data && !(data.allowed || data.overage_allowed)) {
					logBlockedTraffic(
						request,
						body,
						query,
						"exceeded_event_limit",
						"Validation Error",
						undefined,
						clientId
					);
					setAttributes({
						validation_failed: true,
						validation_reason: "exceeded_event_limit",
						autumn_allowed: false,
					});
					return {
						error: new Response(
							JSON.stringify({
								status: "error",
								message: "Exceeded event limit",
							}),
							{
								status: 429,
								headers: { "Content-Type": "application/json" },
							}
						),
					};
				}

				setAttributes({
					autumn_allowed: data?.allowed ?? false,
					autumn_overage_allowed: data?.overage_allowed ?? false,
				});
			} catch (error) {
				captureError(error, {
					message: "Autumn check failed, allowing event through",
				});
				setAttributes({
					autumn_check_failed: true,
				});
			}
		}

		const origin = request.headers.get("origin");
		if (
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
			setAttributes({
				validation_failed: true,
				validation_reason: "origin_not_authorized",
				request_origin: origin,
			});
			return {
				error: new Response(
					JSON.stringify({
						status: "error",
						message: "Origin not authorized",
					}),
					{
						status: 403,
						headers: { "Content-Type": "application/json" },
					}
				),
			};
		}

		const userAgent =
			sanitizeString(
				request.headers.get("user-agent"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || "";

		const ip = extractIpFromRequest(request);

		setAttributes({
			validation_success: true,
			request_has_user_agent: Boolean(userAgent),
			request_has_ip: Boolean(ip),
		});

		return {
			success: true,
			clientId,
			userAgent,
			ip,
			ownerId: website.ownerId || undefined,
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
	body: any,
	query: any,
	clientId: string,
	userAgent: string,
): Promise<{ error?: Response } | undefined> {
	return record("checkForBot", () => {
		const botCheck = detectBot(userAgent, request);

		if (!botCheck.isBot) {
			return;
		}

		const { action, result } = botCheck;

		// Handle ALLOW action - let the request through normally
		if (action === "allow") {
			setAttributes({
				bot_detected: true,
				bot_action: "allow",
				bot_category: botCheck.category,
				bot_name: botCheck.botName || "unknown",
			});
			return; // Process as normal traffic
		}

		// Handle TRACK_ONLY action - log to AI traffic table
		if (action === "track_only") {
			const path =
				body?.path ||
				body?.url ||
				query?.path ||
				request.headers.get("referer") ||
				"";
			const referrer =
				body?.referrer || request.headers.get("referer") || undefined;

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

			setAttributes({
				validation_failed: true,
				validation_reason: "ai_traffic",
				bot_action: "track_only",
				bot_type: result?.category || "unknown",
				bot_name: botCheck.botName || "unknown",
			});

			return {
				error: new Response(JSON.stringify({ status: "ignored" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			};
		}

		// Handle BLOCK action - log to blocked traffic and reject
		logBlockedTraffic(
			request,
			body,
			query,
			botCheck.reason || "unknown_bot",
			botCheck.category || "Bot Detection",
			botCheck.botName,
			clientId,
		);

		setAttributes({
			validation_failed: true,
			validation_reason: "bot_blocked",
			bot_action: "block",
			bot_name: botCheck.botName || "unknown",
			bot_category: botCheck.category || "Bot Detection",
			bot_detection_reason: botCheck.reason || "unknown_bot",
		});

		return {
			error: new Response(JSON.stringify({ status: "ignored" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		};
	});
}
