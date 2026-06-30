import { Heading, Link, Section, Text } from "react-email";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

export interface BlockedTrafficAlertEmailProps {
	baselineEvents?: number;
	baselineHours?: number;
	blockedCount?: number;
	blockReason?: string;
	dashboardUrl?: string;
	fix?: string;
	origin?: string | null;
	previousBlockedCount?: number;
	recentEvents?: number;
	severity?: "critical" | "warning";
	siteLabel?: string;
	windowMinutes?: number;
}

function formatNumber(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) {
		return "—";
	}
	return Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function reasonLabel(reason: string | undefined): string {
	switch (reason) {
		case "origin_not_authorized":
			return "Domain mismatch";
		case "origin_missing":
			return "Missing origin";
		case "ip_not_authorized":
			return "IP allowlist blocked requests";
		default:
			return reason || "Blocked tracking";
	}
}

const DetailRow = ({
	label,
	children,
}: {
	children: React.ReactNode;
	label: string;
}) => (
	<Text className="m-0 mb-2 text-sm" style={{ color: emailBrand.foreground }}>
		<span style={{ color: emailBrand.muted }}>{label} · </span>
		{children}
	</Text>
);

export const BlockedTrafficAlertEmail = ({
	baselineEvents = 0,
	baselineHours = 7 * 24,
	blockReason = "origin_not_authorized",
	blockedCount = 0,
	dashboardUrl,
	fix,
	origin,
	previousBlockedCount = 0,
	recentEvents = 0,
	severity = "warning",
	siteLabel = "your site",
	windowMinutes = 15,
}: BlockedTrafficAlertEmailProps) => {
	const critical = severity === "critical";
	const title = critical
		? `Tracking may be down for ${siteLabel}`
		: `Blocked tracking increased for ${siteLabel}`;
	const preview = critical
		? `${siteLabel} has blocked tracking requests and zero recent pageviews.`
		: `${siteLabel} has increased blocked tracking requests.`;
	const accentBorder = critical ? "#dc2626" : "#f59e0b";

	return (
		<EmailLayout preview={preview} tagline="Tracking alert">
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{title}
				</Heading>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{critical
						? "Databuddy is receiving blocked requests for this website while successful pageviews have dropped to zero."
						: "Databuddy detected more blocked tracking requests than usual for this website."}
				</Text>
			</Section>

			<Section
				className="my-4 rounded border border-border border-l-4 border-solid p-4"
				style={{
					backgroundColor: emailBrand.inset,
					borderLeftColor: accentBorder,
				}}
			>
				<DetailRow label="Reason">{reasonLabel(blockReason)}</DetailRow>
				{origin ? <DetailRow label="Origin">{origin}</DetailRow> : null}
				<DetailRow label="Blocked">
					{formatNumber(blockedCount)} in the last {windowMinutes} minutes
				</DetailRow>
				<DetailRow label="Previous blocked window">
					{formatNumber(previousBlockedCount)}
				</DetailRow>
				<DetailRow label="Recent pageviews">
					{formatNumber(recentEvents)} in the last {windowMinutes * 2} minutes
				</DetailRow>
				<DetailRow label="Earlier pageviews">
					{formatNumber(baselineEvents)} in the previous{" "}
					{Math.round(baselineHours / 24)} days
				</DetailRow>
				{fix ? (
					<Text
						className="m-0 mt-3 text-sm leading-relaxed"
						style={{ color: emailBrand.foreground }}
					>
						<span style={{ color: emailBrand.muted }}>Suggested fix · </span>
						{fix}
					</Text>
				) : null}
			</Section>

			{dashboardUrl ? (
				<Section className="text-center">
					<EmailButton href={dashboardUrl}>Open website settings</EmailButton>
				</Section>
			) : null}

			<Section className="mt-8">
				<Text
					className="m-0 text-center text-xs leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					We ignore localhost and private-network origins for this alert. Need
					help? Reply to this email or visit our{" "}
					<Link
						href="https://www.databuddy.cc/docs/troubleshooting"
						style={{ color: emailBrand.coral, textDecoration: "underline" }}
					>
						troubleshooting docs
					</Link>
					.
				</Text>
			</Section>
		</EmailLayout>
	);
};

BlockedTrafficAlertEmail.PreviewProps = {
	baselineEvents: 1240,
	baselineHours: 7 * 24,
	blockReason: "origin_not_authorized",
	blockedCount: 42,
	dashboardUrl: "https://app.databuddy.cc/websites/ws_123/settings/general",
	fix: "Update the website domain to example.com, or add example.com under Security → Allowed Origins if this is an additional trusted domain.",
	origin: "https://example.com",
	previousBlockedCount: 0,
	recentEvents: 0,
	severity: "critical",
	siteLabel: "Example Site",
	windowMinutes: 15,
} satisfies BlockedTrafficAlertEmailProps;

export default BlockedTrafficAlertEmail;
