import { Autumn as autumn } from "autumn-js";
import { getWebsiteByIdV2, isValidOrigin } from "../hooks/auth";
import { extractIpFromRequest } from "../utils/ip-geo";
import { detectBot } from "../utils/user-agent";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "../utils/validation";
import { logBlockedTraffic } from "./blocked-traffic";
import { captureError, record, setAttributes } from "./tracing";

type ValidationResult = {
	success: boolean;
	clientId: string;
	userAgent: string;
	ip: string;
	ownerId?: string;
};

type ValidationError = {
	error: { status: string; message: string };
};

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
				"validation.failed": true,
				"validation.reason": "payload_too_large",
			});
			return { error: { status: "error", message: "Payload too large" } };
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
				"validation.failed": true,
				"validation.reason": "missing_client_id",
			});
			return { error: { status: "error", message: "Missing client ID" } };
		}

		setAttributes({
			"client.id": clientId,
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
				"validation.failed": true,
				"validation.reason": "invalid_client_id",
				"website.status": website?.status || "not_found",
			});
			return {
				error: { status: "error", message: "Invalid or inactive client ID" },
			};
		}

		setAttributes({
			"website.domain": website.domain,
			"website.status": website.status,
		});

		if (website.ownerId) {
			try {
				const result = await record("autumn.check", () =>
					autumn.check({
						customer_id: website.ownerId || "",
						feature_id: "events",
						send_event: true,
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
						"validation.failed": true,
						"validation.reason": "exceeded_event_limit",
						"autumn.allowed": false,
					});
					return {
						error: { status: "error", message: "Exceeded event limit" },
					};
				}

				setAttributes({
					"autumn.allowed": data?.allowed ?? false,
					"autumn.overage_allowed": data?.overage_allowed ?? false,
				});
			} catch (error) {
				captureError(error, {
					message: "Autumn check failed, allowing event through",
				});
				setAttributes({
					"autumn.check_failed": true,
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
				"validation.failed": true,
				"validation.reason": "origin_not_authorized",
				"request.origin": origin,
			});
			return { error: { status: "error", message: "Origin not authorized" } };
		}

		const userAgent =
			sanitizeString(
				request.headers.get("user-agent"),
				VALIDATION_LIMITS.STRING_MAX_LENGTH
			) || "";

		const ip = extractIpFromRequest(request);

		setAttributes({
			"validation.success": true,
			"request.has_user_agent": Boolean(userAgent),
			"request.has_ip": Boolean(ip),
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
 * Returns error object if bot detected, undefined otherwise
 */
export function checkForBot(
	request: Request,
	body: any,
	query: any,
	clientId: string,
	userAgent: string
): Promise<{ error?: { status: string } } | undefined> {
	return record("checkForBot", () => {
		const botCheck = detectBot(userAgent, request);
		if (botCheck.isBot) {
			logBlockedTraffic(
				request,
				body,
				query,
				botCheck.reason || "unknown_bot",
				botCheck.category || "Bot Detection",
				botCheck.botName,
				clientId
			);
			setAttributes({
				"validation.failed": true,
				"validation.reason": "bot_detected",
				"bot.name": botCheck.botName || "unknown",
				"bot.category": botCheck.category || "Bot Detection",
				"bot.detection_reason": botCheck.reason || "unknown_bot",
			});
			return { error: { status: "ignored" } };
		}
		return;
	});
}
