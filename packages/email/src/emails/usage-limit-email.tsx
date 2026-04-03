import { Heading, Link, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

interface UsageLimitEmailProps {
	featureName?: string;
	limitAmount?: number;
	thresholdType?: "limit_reached" | "allowance_used";
	usageAmount?: number;
	userName?: string;
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toLocaleString();
}

export const UsageLimitEmail = ({
	featureName = "Events",
	usageAmount = 10_000,
	limitAmount = 10_000,
	userName,
	thresholdType = "limit_reached",
}: UsageLimitEmailProps) => {
	const greeting = userName ? `Hi ${userName},` : "Hi there,";
	const isLimitReached = thresholdType === "limit_reached";
	const usageFormatted = formatNumber(usageAmount);
	const limitFormatted = formatNumber(limitAmount);
	const graceFormatted = formatNumber(Math.floor(limitAmount * 1.5));

	return (
		<EmailLayout
			preview={`You've reached your ${featureName} limit`}
			tagline="Usage Alert"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{isLimitReached
						? `${featureName} Limit Reached`
						: `${featureName} Allowance Used`}
				</Heading>
			</Section>

			<Section className="mt-4">
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.foreground }}
				>
					{greeting}
				</Text>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					You've used all {limitFormatted} of your included{" "}
					{featureName.toLowerCase()} this billing period. You can continue up
					to {graceFormatted} (1.5x) before tracking is paused. To avoid
					interruption, consider upgrading your plan.
				</Text>
			</Section>

			<Section
				className="my-6 rounded p-4"
				style={{
					backgroundColor: emailBrand.inset,
					border: `1px solid ${emailBrand.border}`,
				}}
			>
				<Text
					className="m-0 mb-1 text-center text-xs uppercase tracking-wider"
					style={{ color: emailBrand.muted }}
				>
					Current Usage
				</Text>
				<Text
					className="m-0 text-center font-semibold text-2xl"
					style={{ color: emailBrand.foreground }}
				>
					{usageFormatted}{" "}
					<span style={{ color: emailBrand.muted, fontWeight: "normal" }}>
						/ {limitFormatted}
					</span>
				</Text>
			</Section>

			<Section className="text-center">
				<EmailButton href="https://app.databuddy.cc/billing">
					View Plans
				</EmailButton>
			</Section>

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

export default UsageLimitEmail;
