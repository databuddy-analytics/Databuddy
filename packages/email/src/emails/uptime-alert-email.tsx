import { Heading, Link, Section, Text } from "@react-email/components";
import { sanitizeEmailText } from "../utils/sanitize";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

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

export interface UptimeAlertEmailProps {
	kind: "down" | "recovered";
	siteLabel: string;
	url: string;
	checkedAt: number;
	httpCode: number;
	error: string;
	probeRegion?: string;
	totalMs?: number;
	ttfbMs?: number;
	sslValid?: boolean;
	sslExpiryMs?: number;
	/** Optional link to the monitor or site in the dashboard */
	dashboardUrl?: string;
}

function formatCheckedAt(ms: number): string {
	return utcMediumFormatter.format(new Date(ms));
}

function formatDurationMs(ms: number | undefined): string | undefined {
	if (ms === undefined || Number.isNaN(ms)) {
		return undefined;
	}
	return `${Math.round(ms)} ms`;
}

function safeHttpUrlForHref(raw: string): string {
	try {
		const parsed = new URL(raw);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.href;
		}
	} catch {
		// ignore
	}
	return "https://app.databuddy.cc/";
}

function sslLineFrom(
	sslValid: boolean | undefined,
	sslExpiryMs: number | undefined
): string | undefined {
	if (sslValid === undefined) {
		return undefined;
	}
	const status = sslValid ? "Valid" : "Invalid";
	if (
		sslExpiryMs !== undefined &&
		sslExpiryMs > 0 &&
		Number.isFinite(sslExpiryMs)
	) {
		const exp = utcMediumFormatter.format(new Date(sslExpiryMs));
		return `${status} · expires ${exp}`;
	}
	return status;
}

export const UptimeAlertEmail = ({
	kind,
	siteLabel,
	url,
	checkedAt,
	httpCode,
	error,
	probeRegion,
	totalMs,
	ttfbMs,
	sslValid,
	sslExpiryMs,
	dashboardUrl,
}: UptimeAlertEmailProps) => {
	const safeLabel = sanitizeEmailText(siteLabel);
	const isDown = kind === "down";
	const preview = isDown
		? `${safeLabel} is unreachable`
		: `${safeLabel} is back online`;
	const heading = isDown
		? `Uptime: ${safeLabel} is down`
		: `Uptime: ${safeLabel} is back up`;
	const tagline = isDown ? "Uptime alert" : "Site recovered";
	const accentBorder = isDown ? "#dc2626" : "#22c55e";
	const href = safeHttpUrlForHref(url);
	const ttfbStr = formatDurationMs(ttfbMs);
	const totalStr = formatDurationMs(totalMs);
	const responseParts: string[] = [];
	if (ttfbStr !== undefined) {
		responseParts.push(`TTFB ${ttfbStr}`);
	}
	if (totalStr !== undefined) {
		responseParts.push(`total ${totalStr}`);
	}
	const responseLine = responseParts.join(" · ");
	const sslLine = sslLineFrom(sslValid, sslExpiryMs);
	const errorTrimmed = error.trim();
	const safeError =
		isDown && errorTrimmed.length > 0 ? sanitizeEmailText(errorTrimmed) : "";

	return (
		<EmailLayout preview={preview} tagline={tagline}>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: "#d7d7dd" }}
				>
					{heading}
				</Heading>
			</Section>

			<Section className="mt-2">
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: "#717175" }}
				>
					{isDown
						? "We could not reach this URL during the latest health check. Details below."
						: "The latest health check succeeded. Your site responded normally."}
				</Text>
			</Section>

			<Section
				className="my-6 rounded p-4"
				style={{
					backgroundColor: "#111114",
					border: "1px solid #28282c",
					borderLeft: `4px solid ${accentBorder}`,
				}}
			>
				<Text
					className="m-0 mb-3 text-xs uppercase tracking-wider"
					style={{ color: "#717175" }}
				>
					Check details
				</Text>
				<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
					<span style={{ color: "#717175" }}>URL · </span>
					<Link
						className="text-sm underline"
						href={href}
						style={{ color: "#3030ed", wordBreak: "break-all" }}
					>
						{sanitizeEmailText(url)}
					</Link>
				</Text>
				<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
					<span style={{ color: "#717175" }}>Checked at · </span>
					{formatCheckedAt(checkedAt)}
				</Text>
				<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
					<span style={{ color: "#717175" }}>HTTP · </span>
					{httpCode}
				</Text>
				{responseLine.length > 0 ? (
					<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
						<span style={{ color: "#717175" }}>Response · </span>
						{responseLine}
					</Text>
				) : null}
				{probeRegion ? (
					<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
						<span style={{ color: "#717175" }}>Region · </span>
						{sanitizeEmailText(probeRegion)}
					</Text>
				) : null}
				{sslLine ? (
					<Text className="m-0 mb-2 text-sm" style={{ color: "#d7d7dd" }}>
						<span style={{ color: "#717175" }}>SSL · </span>
						{sslLine}
					</Text>
				) : null}
				{safeError.length > 0 ? (
					<Text
						className="m-0 mt-3 text-sm leading-relaxed"
						style={{ color: "#fca5a5" }}
					>
						<span style={{ color: "#717175" }}>Error · </span>
						{safeError}
					</Text>
				) : null}
			</Section>

			{dashboardUrl ? (
				<Section className="text-center">
					<EmailButton href={dashboardUrl}>View in Databuddy</EmailButton>
				</Section>
			) : null}

			<Section className="mt-8">
				<Text
					className="m-0 text-center text-xs leading-relaxed"
					style={{ color: "#717175" }}
				>
					Need help? Reply to this email or visit our{" "}
					<Link
						href="https://databuddy.cc/docs"
						style={{ color: "#3030ed", textDecoration: "underline" }}
					>
						documentation
					</Link>
					.
				</Text>
			</Section>
		</EmailLayout>
	);
};

export default UptimeAlertEmail;
