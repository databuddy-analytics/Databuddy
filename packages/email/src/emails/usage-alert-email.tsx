import { DATABUNNY_USAGE } from "@databuddy/shared/billing";
import { Heading, Link, Section, Text } from "react-email";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import {
	formatResetDate,
	formatUsageNumber,
	formatUsagePercentage,
} from "./usage-email-utils";

export interface UsageAlertEmailProps {
	featureDescription: string;
	featureName: string;
	limitAmount: number;
	nextResetAt?: number | null;
	organizationName?: string;
	overageAllowed: boolean;
	pausedActivity: string;
	remainingAmount: number;
	usageAmount: number;
	usageUnit: string;
}

export const UsageAlertEmail = ({
	featureDescription,
	featureName,
	limitAmount,
	nextResetAt,
	organizationName,
	overageAllowed,
	pausedActivity,
	remainingAmount,
	usageAmount,
	usageUnit,
}: UsageAlertEmailProps) => {
	const usage = formatUsageNumber(usageAmount);
	const limit = formatUsageNumber(limitAmount);
	const remaining = formatUsageNumber(Math.max(0, remainingAmount));
	const percentage = formatUsagePercentage(usageAmount, limitAmount);
	const resetDate = formatResetDate(nextResetAt);
	const context = organizationName ? ` for ${organizationName}` : "";

	return (
		<EmailLayout
			preview={`${featureName}${context}: ${usage} of ${limit} ${usageUnit} used, with ${remaining} remaining.`}
			tagline="Usage notice"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{featureName} is at {percentage}
				</Heading>
			</Section>

			<Section className="mt-4">
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					You have used {usage} of {limit} {usageUnit}
					{context} this billing period. {remaining} remain.
				</Text>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{featureDescription}
				</Text>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{overageAllowed
						? "Your billing settings allow usage beyond the included allowance. Additional usage may be billed according to your plan."
						: `If the remaining allowance reaches zero, access to ${pausedActivity} will pause until the allowance resets or the plan is changed.`}
					{resetDate ? ` The current allowance resets ${resetDate} UTC.` : ""}
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
					Current usage
				</Text>
				<Text
					className="m-0 text-center font-semibold text-2xl"
					style={{ color: emailBrand.amber }}
				>
					{usage}{" "}
					<span style={{ color: emailBrand.muted, fontWeight: "normal" }}>
						/ {limit} {usageUnit}
					</span>
				</Text>
			</Section>

			<Section className="text-center">
				<EmailButton href="https://app.databuddy.cc/billing">
					Review usage and plans
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
					, or manage these emails in your{" "}
					<Link
						href="https://app.databuddy.cc/settings/notifications"
						style={{ color: emailBrand.coral, textDecoration: "underline" }}
					>
						notification settings
					</Link>
					.
				</Text>
			</Section>
		</EmailLayout>
	);
};

UsageAlertEmail.PreviewProps = {
	featureDescription: DATABUNNY_USAGE.description,
	featureName: DATABUNNY_USAGE.name,
	limitAmount: 350,
	nextResetAt: Date.UTC(2026, 7, 1),
	organizationName: "Acme Inc",
	overageAllowed: false,
	pausedActivity: DATABUNNY_USAGE.pausedActivity,
	remainingAmount: 70,
	usageAmount: 280,
	usageUnit: DATABUNNY_USAGE.unit,
} satisfies UsageAlertEmailProps;

export default UsageAlertEmail;
