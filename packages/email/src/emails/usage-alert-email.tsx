import { Heading, Link, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";

interface UsageAlertEmailProps {
	alertName?: string;
	featureName?: string;
	threshold?: number;
	thresholdType?: "usage" | "usage_percentage_threshold";
	userName?: string;
}

export const UsageAlertEmail = ({
	featureName = "Events",
	threshold = 80,
	thresholdType = "usage_percentage_threshold",
	alertName,
	userName,
}: UsageAlertEmailProps) => {
	const greeting = userName ? `Hi ${userName},` : "Hi there,";
	const isPercentage = thresholdType === "usage_percentage_threshold";
	const thresholdLabel = isPercentage
		? `${threshold}%`
		: threshold.toLocaleString();
	const headingText = alertName ?? `${thresholdLabel} of ${featureName} used`;

	return (
		<EmailLayout
			preview={`Usage alert: ${thresholdLabel} of your ${featureName} ${isPercentage ? "allowance" : "limit"} reached`}
			tagline="Usage Alert"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{headingText}
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
					{isPercentage
						? `You've used ${thresholdLabel} of your ${featureName.toLowerCase()} allowance this billing period. Consider upgrading your plan to avoid hitting your limit.`
						: `Your ${featureName.toLowerCase()} usage has crossed ${thresholdLabel} this billing period. Consider upgrading your plan if you need more capacity.`}
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
					Alert Threshold
				</Text>
				<Text
					className="m-0 text-center font-semibold text-2xl"
					style={{ color: emailBrand.amber }}
				>
					{thresholdLabel}
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

export default UsageAlertEmail;
