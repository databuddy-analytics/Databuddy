import type { NotificationClientConfig } from "./client";
import type { NotificationChannel } from "./types";

interface AlarmDestination {
	config: unknown;
	identifier: string;
	type: string;
}

export interface AlarmNotificationTarget {
	channel: NotificationChannel;
	clientConfig: NotificationClientConfig;
}

const FORBIDDEN_WEBHOOK_HEADERS = new Set([
	"authorization",
	"content-length",
	"content-type",
	"cookie",
	"host",
	"connection",
	"transfer-encoding",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-original-url",
	"x-real-ip",
]);

const CRLF_PATTERN = /[\r\n]/;
const SLACK_WEBHOOK_HOST = "hooks.slack.com";

let warnedEmailUnconfigured = false;
function warnAlarmEmailUnconfigured(): void {
	if (warnedEmailUnconfigured) {
		return;
	}
	warnedEmailUnconfigured = true;
	console.warn(
		"[notifications] Email alert delivery disabled: RESEND_API_KEY is not configured"
	);
}

function isAllowedSlackWebhook(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" && parsed.hostname === SLACK_WEBHOOK_HOST
		);
	} catch {
		return false;
	}
}

function sanitizeWebhookHeaders(
	raw: unknown
): Record<string, string> | undefined {
	if (!raw || typeof raw !== "object") {
		return;
	}
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value !== "string") {
			continue;
		}
		if (FORBIDDEN_WEBHOOK_HEADERS.has(name.toLowerCase())) {
			continue;
		}
		if (CRLF_PATTERN.test(name) || CRLF_PATTERN.test(value)) {
			continue;
		}
		out[name] = value;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Legacy adapter for callers that can only represent one provider per channel.
 * Use buildAlarmNotificationTargets for per-destination fanout.
 */
export function buildAlarmNotificationConfig(destinations: AlarmDestination[]) {
	const clientConfig: NotificationClientConfig = {};
	const channels = new Set<NotificationChannel>();

	for (const target of buildAlarmNotificationTargets(destinations)) {
		if (channels.has(target.channel)) {
			continue;
		}
		Object.assign(clientConfig, target.clientConfig);
		channels.add(target.channel);
	}

	return { clientConfig, channels: Array.from(channels) };
}

export function buildAlarmNotificationTargets(
	destinations: AlarmDestination[]
): AlarmNotificationTarget[] {
	const targets: AlarmNotificationTarget[] = [];

	for (const dest of destinations) {
		const cfg = (dest.config ?? {}) as Record<string, unknown>;

		if (dest.type === "slack") {
			if (!isAllowedSlackWebhook(dest.identifier)) {
				continue;
			}
			targets.push({
				channel: "slack",
				clientConfig: { slack: { webhookUrl: dest.identifier } },
			});
		} else if (dest.type === "webhook") {
			targets.push({
				channel: "webhook",
				clientConfig: {
					webhook: {
						url: dest.identifier,
						headers: sanitizeWebhookHeaders(cfg.headers),
					},
				},
			});
		} else if (dest.type === "email") {
			if (!process.env.RESEND_API_KEY) {
				warnAlarmEmailUnconfigured();
				continue;
			}
			targets.push({
				channel: "email",
				clientConfig: {
					email: {
						defaultTo: dest.identifier,
						from:
							typeof cfg.from === "string"
								? cfg.from
								: "Databuddy <alerts@databuddy.cc>",
						sendEmailAction: async (payload: {
							to: string | string[];
							subject: string;
							html?: string;
							text?: string;
							from?: string;
						}) => {
							const { Resend } = await import("resend");
							const apiKey = process.env.RESEND_API_KEY;
							if (!apiKey) {
								throw new Error("Email delivery is not configured");
							}
							const resend = new Resend(apiKey);
							const result = await resend.emails.send({
								from: payload.from || "Databuddy <alerts@databuddy.cc>",
								to: Array.isArray(payload.to) ? payload.to : [payload.to],
								subject: payload.subject,
								html: payload.html || payload.text || "",
								...(payload.text ? { text: payload.text } : {}),
							});
							if (result.error) {
								throw new Error(
									`Email delivery failed: ${result.error.message}`
								);
							}
						},
					},
				},
			});
		}
	}

	return targets;
}
