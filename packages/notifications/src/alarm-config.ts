import { config, readBooleanEnv } from "@databuddy/env/app";
import {
	type AlarmDestinationType,
	isForbiddenWebhookHeaderName,
} from "@databuddy/shared/alarm-destinations";
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
		if (isForbiddenWebhookHeaderName(name)) {
			continue;
		}
		if (CRLF_PATTERN.test(name) || CRLF_PATTERN.test(value)) {
			continue;
		}
		out[name] = value;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}
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

export const MAX_ALARM_DESTINATIONS = 10;

interface AlarmDeliveryContext {
	defaultEmailFrom: string;
}

type AlarmDestinationBuilder = (
	dest: AlarmDestination,
	ctx: AlarmDeliveryContext
) => AlarmNotificationTarget | undefined;

const buildSlackTarget: AlarmDestinationBuilder = (dest) => {
	if (!isAllowedSlackWebhook(dest.identifier)) {
		return;
	}
	return {
		channel: "slack",
		clientConfig: { slack: { webhookUrl: dest.identifier } },
	};
};

const buildWebhookTarget: AlarmDestinationBuilder = (dest) => {
	const cfg = (dest.config ?? {}) as Record<string, unknown>;
	return {
		channel: "webhook",
		clientConfig: {
			webhook: {
				url: dest.identifier,
				headers: sanitizeWebhookHeaders(cfg.headers),
			},
		},
	};
};

const buildEmailTarget: AlarmDestinationBuilder = (dest, ctx) => {
	if (!config.services.resendApiKey) {
		warnAlarmEmailUnconfigured();
		return;
	}
	return {
		channel: "email",
		clientConfig: {
			email: {
				defaultTo: dest.identifier,
				from: ctx.defaultEmailFrom,
				sendEmailAction: async (payload: {
					to: string | string[];
					subject: string;
					html?: string;
					text?: string;
				}) => {
					const { Resend } = await import("resend");
					const apiKey = config.services.resendApiKey;
					if (!apiKey) {
						throw new Error("Email delivery is not configured");
					}
					const resend = new Resend(apiKey);
					const result = await resend.emails.send({
						from: ctx.defaultEmailFrom,
						to: Array.isArray(payload.to) ? payload.to : [payload.to],
						subject: payload.subject,
						html: payload.html || payload.text || "",
						...(payload.text ? { text: payload.text } : {}),
					});
					if (result.error) {
						throw new Error(`Email delivery failed: ${result.error.message}`);
					}
				},
			},
		},
	};
};

/**
 * Every destination type the delivery layer knows how to send to. Typed as a
 * `Record` over `AlarmDestinationType` so adding a type to the shared
 * registry without adding a builder here fails to compile; `Object.keys` of
 * this map is also asserted against the DB and RPC type lists in
 * `alarms.test.ts` so the three can't silently drift apart.
 */
export const ALARM_DESTINATION_BUILDERS: Record<
	AlarmDestinationType,
	AlarmDestinationBuilder
> = {
	slack: buildSlackTarget,
	webhook: buildWebhookTarget,
	email: buildEmailTarget,
};

export function buildAlarmNotificationTargets(
	destinations: AlarmDestination[]
): AlarmNotificationTarget[] {
	const targets: AlarmNotificationTarget[] = [];
	const defaultEmailFrom =
		(readBooleanEnv("SELFHOST") &&
			(process.env.ALERTS_EMAIL_FROM?.trim() ||
				process.env.EMAIL_FROM?.trim())) ||
		"Databuddy <alerts@databuddy.cc>";
	const ctx: AlarmDeliveryContext = { defaultEmailFrom };

	const builders = ALARM_DESTINATION_BUILDERS as Record<
		string,
		AlarmDestinationBuilder | undefined
	>;
	for (const dest of destinations.slice(0, MAX_ALARM_DESTINATIONS)) {
		if (!Object.hasOwn(builders, dest.type)) {
			continue;
		}
		const target = builders[dest.type]?.(dest, ctx);
		if (target) {
			targets.push(target);
		}
	}

	return targets;
}
