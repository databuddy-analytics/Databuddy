import { Heading, Link, Section, Text } from "react-email";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

const utcFormatter = new Intl.DateTimeFormat("en-US", {
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
	checkedAt?: number;
	dashboardUrl?: string;
	error?: string;
	httpCode?: number;
	kind?: "down" | "recovered";
	probeRegion?: string;
	siteLabel?: string;
	sslExpiryMs?: number;
	sslValid?: boolean;
	totalMs?: number;
	ttfbMs?: number;
	url?: string;
}

function fmtMs(ms: number | undefined): string | undefined {
	if (ms === undefined || Number.isNaN(ms)) {
		return;
	}
	return `${Math.round(ms)} ms`;
}

function fmtDate(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) {
		return "—";
	}
	return utcFormatter.format(new Date(ms));
}

function safeHref(raw: string | undefined): string {
	if (!raw) {
		return "https://app.databuddy.cc/";
	}
	try {
		const parsed = new URL(raw);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.href;
		}
	} catch {
		/* invalid */
	}
	return "https://app.databuddy.cc/";
}

function sslSummary(
	valid: boolean | undefined,
	expiryMs: number | undefined
): string | undefined {
	if (valid === undefined) {
		return;
	}
	const status = valid ? "Valid" : "Invalid";
	if (expiryMs !== undefined && expiryMs > 0 && Number.isFinite(expiryMs)) {
		return `${status} · expires ${fmtDate(expiryMs)}`;
	}
	return status;
}

const DetailRow = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => (
	<Text className="m-0 mb-2 text-sm" style={{ color: emailBrand.foreground }}>
		<span style={{ color: emailBrand.muted }}>{label} · </span>
		{children}
	</Text>
);

export const UptimeAlertEmail = ({
	kind = "down",
	siteLabel = "example.com",
	url = "https://example.com",
	checkedAt,
	httpCode = 0,
	error = "",
	probeRegion,
	totalMs,
	ttfbMs,
	sslValid,
	sslExpiryMs,
	dashboardUrl,
}: UptimeAlertEmailProps) => {
	const safe = siteLabel || "your site";
	const isDown = kind === "down";
	const accentBorder = isDown ? "#dc2626" : "#22c55e";
	const href = safeHref(url);

	const ttfbStr = fmtMs(ttfbMs);
	const totalStr = fmtMs(totalMs);
	const responseParts: string[] = [];
	if (ttfbStr !== undefined) {
		responseParts.push(`TTFB ${ttfbStr}`);
	}
	if (totalStr !== undefined) {
		responseParts.push(`total ${totalStr}`);
	}
	const responseLine = responseParts.join(" · ");
	const ssl = sslSummary(sslValid, sslExpiryMs);
	const trimmedErr = error.trim();
	const safeErr = isDown && trimmedErr.length > 0 ? trimmedErr : "";

	return (
		<EmailLayout
			preview={
				isDown
					? `${safe} failed health check — HTTP ${httpCode || "timeout"}`
					: `${safe} is responding normally again`
			}
			tagline={isDown ? "Uptime alert" : "Site recovered"}
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{isDown ? `${safe} is down` : `${safe} is back up`}
				</Heading>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{isDown
						? "We could not reach this URL during the latest health check."
						: "The latest health check succeeded. Your site responded normally."}
				</Text>
			</Section>

			<Section
				className="my-4 rounded border border-border border-l-4 border-solid p-4"
				style={{
					backgroundColor: emailBrand.inset,
					borderLeftColor: accentBorder,
				}}
			>
				<DetailRow label="URL">
					<Link
						className="text-sm underline"
						href={href}
						style={{ color: emailBrand.coral, wordBreak: "break-all" }}
					>
						{url || href}
					</Link>
				</DetailRow>
				<DetailRow label="Checked at">{fmtDate(checkedAt)}</DetailRow>
				<DetailRow label="HTTP">{httpCode}</DetailRow>
				{responseLine.length > 0 ? (
					<DetailRow label="Response">{responseLine}</DetailRow>
				) : null}
				{probeRegion ? (
					<DetailRow label="Region">{probeRegion}</DetailRow>
				) : null}
				{ssl ? <DetailRow label="SSL">{ssl}</DetailRow> : null}
				{safeErr.length > 0 ? (
					<Text
						className="m-0 mt-3 text-sm leading-relaxed"
						style={{ color: "#fca5a5" }}
					>
						<span style={{ color: emailBrand.muted }}>Error · </span>
						{safeErr}
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
					style={{ color: emailBrand.muted }}
				>
					Need help? Reply to this email or visit our{" "}
					<Link
						href="https://www.databuddy.cc/docs"
						style={{ color: emailBrand.coral, textDecoration: "underline" }}
					>
						documentation
					</Link>
					.
				</Text>
			</Section>
		</EmailLayout>
	);
};

UptimeAlertEmail.PreviewProps = {
	checkedAt: Date.now(),
	dashboardUrl: "https://app.databuddy.cc/uptime",
	error: "connect ETIMEDOUT 10.0.0.1:443",
	httpCode: 0,
	kind: "down",
	probeRegion: "us-east-1",
	siteLabel: "example.com",
	sslExpiryMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
	sslValid: true,
	totalMs: 1842,
	ttfbMs: 1520,
	url: "https://example.com",
} satisfies UptimeAlertEmailProps;

export default UptimeAlertEmail;
