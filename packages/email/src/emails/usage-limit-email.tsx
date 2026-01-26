import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

interface UsageLimitEmailProps {
	featureName?: string;
	usageAmount?: number;
	limitAmount?: number;
	userName?: string;
	thresholdType?: "limit_reached" | "allowance_used";
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
	const gracePeriodLimit = Math.floor(limitAmount * 1.5);
	const gracePeriodFormatted = formatNumber(gracePeriodLimit);

	return (
		<EmailLayout
			preview={`You've reached your ${featureName} limit`}
			tagline="Usage Alert"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: "#d7d7dd" }}
				>
					{isLimitReached
						? `${featureName} Limit Reached`
						: `${featureName} Allowance Used`}
				</Heading>
			</Section>

			<Section className="mt-4">
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: "#d7d7dd" }}
				>
					{greeting}
				</Text>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: "#717175" }}
				>
					{isLimitReached
						? `You've used all ${limitFormatted} of your included ${featureName.toLowerCase()} for this billing period. You can continue using up to ${gracePeriodFormatted} (1.5x your limit) before tracking is paused.`
						: `You've exhausted your ${featureName.toLowerCase()} allowance for this period. You can continue using up to ${gracePeriodFormatted} (1.5x your limit) before tracking is paused.`}
				</Text>
			</Section>

			<Section
				className="my-6 rounded p-4"
				style={{ backgroundColor: "#111114", border: "1px solid #28282c" }}
			>
				<Text
					className="m-0 mb-1 text-center text-xs uppercase tracking-wider"
					style={{ color: "#717175" }}
				>
					Current Usage
				</Text>
				<Text
					className="m-0 text-center font-semibold text-2xl"
					style={{ color: "#d7d7dd" }}
				>
					{usageFormatted}{" "}
					<span style={{ color: "#717175", fontWeight: "normal" }}>
						/ {limitFormatted}
					</span>
				</Text>
				<Text
					className="m-0 mt-2 text-center text-xs"
					style={{ color: "#717175" }}
				>
					Grace period: up to {gracePeriodFormatted} before blocking
				</Text>
			</Section>

			<Section>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: "#717175" }}
				>
					You have a grace period and can continue using up to 1.5x your limit
					before tracking is paused. To avoid interruption, consider upgrading
					your plan. You can also wait until your usage resets at the start of
					your next billing period.
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

export default UsageLimitEmail;
