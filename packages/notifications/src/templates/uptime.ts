import type { NotificationPayload, NotificationPriority } from "../types";

export type UptimeNotificationKind = "down" | "recovered";

export interface UptimeNotificationInput {
	kind: UptimeNotificationKind;
	/** Display name for the monitored site or service */
	siteLabel: string;
	url: string;
	/** Check time as Unix ms (UTC formatting is applied in the builder) */
	checkedAt: number;
	httpCode: number;
	/** Error detail when the check failed; use empty string when none */
	error: string;
	probeRegion?: string;
	totalMs?: number;
	ttfbMs?: number;
	sslValid?: boolean;
	/** SSL certificate expiry as Unix ms, if known */
	sslExpiryMs?: number;
}

const utcMediumFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: "UTC",
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	second: "2-digit",
	timeZoneName: "short",
});

function formatUtcTimestamp(ms: number): string {
	return utcMediumFormatter.format(new Date(ms));
}

function formatDurationMs(ms: number | undefined): string | undefined {
	if (ms === undefined || Number.isNaN(ms)) {
		return undefined;
	}
	return `${Math.round(ms)} ms`;
}

function sslLine(input: UptimeNotificationInput): string | undefined {
	if (input.sslValid === undefined) {
		return undefined;
	}
	const status = input.sslValid ? "valid" : "invalid";
	if (
		input.sslExpiryMs !== undefined &&
		input.sslExpiryMs > 0 &&
		Number.isFinite(input.sslExpiryMs)
	) {
		const exp = utcMediumFormatter.format(new Date(input.sslExpiryMs));
		return `SSL: ${status} (expires ${exp} UTC)`;
	}
	return `SSL: ${status}`;
}

function buildMessageLines(input: UptimeNotificationInput): string[] {
	const lines: string[] = [
		`URL: ${input.url}`,
		`Checked at: ${formatUtcTimestamp(input.checkedAt)}`,
	];

	lines.push(`HTTP: ${input.httpCode}`);

	const total = formatDurationMs(input.totalMs);
	const ttfb = formatDurationMs(input.ttfbMs);
	if (total !== undefined || ttfb !== undefined) {
		const parts: string[] = [];
		if (ttfb !== undefined) {
			parts.push(`TTFB ${ttfb}`);
		}
		if (total !== undefined) {
			parts.push(`total ${total}`);
		}
		lines.push(`Response: ${parts.join(", ")}`);
	}

	if (input.probeRegion) {
		lines.push(`Region: ${input.probeRegion}`);
	}

	const ssl = sslLine(input);
	if (ssl) {
		lines.push(ssl);
	}

	if (input.kind === "down" && input.error.trim().length > 0) {
		lines.push(`Error: ${input.error.trim()}`);
	}

	return lines;
}

function priorityForKind(kind: UptimeNotificationKind): NotificationPriority {
	if (kind === "down") {
		return "urgent";
	}
	return "normal";
}

function titleForInput(input: UptimeNotificationInput): string {
	if (input.kind === "down") {
		return `Uptime: ${input.siteLabel} is down`;
	}
	return `Uptime: ${input.siteLabel} is back up`;
}

/**
 * Builds a {@link NotificationPayload} for uptime down/recovered alerts with
 * consistent title, body, priority, and structured metadata for routing and webhooks.
 */
export function buildUptimeNotificationPayload(
	input: UptimeNotificationInput
): NotificationPayload {
	const message = buildMessageLines(input).join("\n");

	const metadata: Record<string, unknown> = {
		template: "uptime",
		kind: input.kind,
		siteLabel: input.siteLabel,
		url: input.url,
		checkedAt: input.checkedAt,
		httpCode: input.httpCode,
	};

	if (input.error.trim().length > 0) {
		metadata.error = input.error.trim();
	}
	if (input.probeRegion) {
		metadata.probeRegion = input.probeRegion;
	}
	if (input.totalMs !== undefined) {
		metadata.totalMs = input.totalMs;
	}
	if (input.ttfbMs !== undefined) {
		metadata.ttfbMs = input.ttfbMs;
	}
	if (input.sslValid !== undefined) {
		metadata.sslValid = input.sslValid;
	}
	if (
		input.sslExpiryMs !== undefined &&
		input.sslExpiryMs > 0 &&
		Number.isFinite(input.sslExpiryMs)
	) {
		metadata.sslExpiryMs = input.sslExpiryMs;
	}

	return {
		title: titleForInput(input),
		message,
		priority: priorityForKind(input.kind),
		metadata,
	};
}
