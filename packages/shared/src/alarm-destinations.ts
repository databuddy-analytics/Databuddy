import { z } from "zod";
import { SLACK_WEBHOOK_PATTERN } from "./uptime";

/**
 * Single source of truth for which alarm destination types exist. The DB
 * schema, the RPC discriminated union, the notification delivery builder,
 * and the dashboard alarm form all derive their type list, validation, and
 * secret-redaction rules from this registry so the four can't drift apart.
 */
export const ALARM_DESTINATION_TYPES = ["slack", "email", "webhook"] as const;
export type AlarmDestinationType = (typeof ALARM_DESTINATION_TYPES)[number];

const FORBIDDEN_WEBHOOK_HEADER_NAMES = new Set([
	"authorization",
	"connection",
	"content-length",
	"content-type",
	"cookie",
	"host",
	"transfer-encoding",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-original-url",
	"x-real-ip",
]);

const CRLF_PATTERN = /[\r\n]/;
const MAX_WEBHOOK_HEADERS = 20;

export function isForbiddenWebhookHeaderName(name: string): boolean {
	return FORBIDDEN_WEBHOOK_HEADER_NAMES.has(name.toLowerCase());
}

/**
 * Validates custom webhook headers at write time. A header rejected here
 * must never be one the delivery builder silently drops at send time -
 * `sanitizeWebhookHeaders` in `@databuddy/notifications` uses the same
 * forbidden-name set as a defense-in-depth filter for rows written before
 * this validation existed, not as the primary gate.
 */
export const webhookHeadersSchema = z
	.record(
		z
			.string()
			.min(1)
			.max(128)
			.refine((name) => !isForbiddenWebhookHeaderName(name), {
				message: "Header name is not allowed.",
			})
			.refine((name) => !CRLF_PATTERN.test(name), {
				message: "Header name must not contain line breaks.",
			}),
		z
			.string()
			.max(2048)
			.refine((value) => !CRLF_PATTERN.test(value), {
				message: "Header value must not contain line breaks.",
			})
	)
	.refine((rec) => Object.keys(rec).length <= MAX_WEBHOOK_HEADERS, {
		message: `At most ${MAX_WEBHOOK_HEADERS} custom webhook headers are allowed.`,
	});

export function maskTail(value: string, keep = 4): string {
	if (value.length <= keep) {
		return "•".repeat(value.length);
	}
	return `${"•".repeat(value.length - keep)}${value.slice(-keep)}`;
}

/**
 * Masks the values of any `secretFields` present in a destination's config.
 * A field holding a record of strings (e.g. webhook `headers`) has each of
 * its values masked; a field holding a plain string is masked directly.
 */
export function redactDestinationConfig(
	config: Record<string, unknown>,
	secretFields: readonly string[]
): Record<string, unknown> {
	let result = config;
	for (const field of secretFields) {
		const value = result[field];
		if (value && typeof value === "object" && !Array.isArray(value)) {
			result = {
				...result,
				[field]: Object.fromEntries(
					Object.entries(value as Record<string, unknown>).map(
						([name, fieldValue]) => [
							name,
							typeof fieldValue === "string"
								? maskTail(fieldValue)
								: fieldValue,
						]
					)
				),
			};
		} else if (typeof value === "string") {
			result = { ...result, [field]: maskTail(value) };
		}
	}
	return result;
}

export interface AlarmDestinationDefinition<
	TType extends AlarmDestinationType = AlarmDestinationType,
> {
	configSchema: z.ZodType<Record<string, unknown>>;
	fieldLabel: string;
	identifierSchema: z.ZodType<string>;
	label: string;
	/** Whether the identifier itself is masked on read (false only for email). */
	maskIdentifier: boolean;
	placeholder: string;
	/** Config keys masked on read (see `redactDestinationConfig`). */
	secretFields: readonly string[];
	type: TType;
}

export const ALARM_DESTINATION_REGISTRY: {
	[TType in AlarmDestinationType]: AlarmDestinationDefinition<TType>;
} = {
	slack: {
		type: "slack",
		label: "Slack",
		fieldLabel: "Webhook URL",
		placeholder: "https://hooks.slack.com/services/...",
		identifierSchema: z
			.string()
			.regex(
				SLACK_WEBHOOK_PATTERN,
				"Slack destination must be a hooks.slack.com webhook URL"
			),
		configSchema: z.record(z.string(), z.unknown()).default({}),
		secretFields: [],
		maskIdentifier: true,
	},
	email: {
		type: "email",
		label: "Email",
		fieldLabel: "Email address",
		placeholder: "alerts@example.com",
		identifierSchema: z.string().email(),
		configSchema: z.record(z.string(), z.unknown()).default({}),
		secretFields: [],
		maskIdentifier: false,
	},
	webhook: {
		type: "webhook",
		label: "Webhook",
		fieldLabel: "Endpoint URL",
		placeholder: "https://api.example.com/webhooks/...",
		identifierSchema: z
			.string()
			.url("Webhook destination must be a valid URL")
			.refine(
				(url) => url.startsWith("http://") || url.startsWith("https://"),
				"Webhook destination must use http(s)"
			),
		configSchema: z
			.object({
				headers: webhookHeadersSchema.optional(),
				method: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
			})
			.passthrough()
			.default({}),
		secretFields: ["headers"],
		maskIdentifier: true,
	},
};
