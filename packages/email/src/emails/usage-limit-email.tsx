import { DATABUNNY_USAGE } from "@databuddy/shared/billing";
import { Heading, Link, Section, Text } from "react-email";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { formatResetDate, formatUsageNumber } from "./usage-email-utils";

export type UsageLimitType = "included" | "max_purchase" | "spend_limit";

export interface UsageLimitEmailProps {
	featureDescription: string;
	featureName: string;
	isAvailable: boolean;
	limitAmount: number;
	limitType: UsageLimitType;
	nextResetAt?: number | null;
	organizationName?: string;
	overageAllowed: boolean;
	pausedActivity: string;
	remainingAmount: number;
	usageAmount: number;
	usageUnit: string;
}

const LIMIT_HEADINGS: Record<UsageLimitType, string> = {
	included: "Included allowance used",
	max_purchase: "Top-up limit reached",
	spend_limit: "Spending limit reached",
};

export const UsageLimitEmail = ({
	featureDescription,
	featureName,
	isAvailable,
	limitAmount,
	limitType,
	nextResetAt,
	organizationName,
	overageAllowed,
	pausedActivity,
	remainingAmount,
	usageAmount,
	usageUnit,
}: UsageLimitEmailProps) => {
	const usage = formatUsageNumber(usageAmount);
	const limit = formatUsageNumber(limitAmount);
	const remaining = formatUsageNumber(Math.max(0, remainingAmount));
	const resetDate = formatResetDate(nextResetAt);
	const context = organizationName ? ` for ${organizationName}` : "";
	const accessStatus = isAvailable
		? "Access remains available."
		: `Access to ${pausedActivity} is paused.`;

	return (
		<EmailLayout
			preview={`${featureName}${context}: ${usage} of ${limit} ${usageUnit} used. ${accessStatus}`}
			tagline="Usage limit notice"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{featureName}: {LIMIT_HEADINGS[limitType]}
				</Heading>
			</Section>

			<Section className="mt-4">
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					Current usage{context} is {usage} of {limit} {usageUnit}, with{" "}
					{remaining} remaining.
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
					{isAvailable
						? overageAllowed
							? `Access to ${pausedActivity} can continue. Additional usage may be billed according to your plan.`
							: `Access to ${pausedActivity} can continue with the remaining allowance shown above.`
						: `Access to ${pausedActivity} is currently paused. Change the billing limit or plan to resume it${resetDate ? `, or wait until the allowance resets ${resetDate} UTC` : ""}.`}
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
					style={{ color: emailBrand.foreground }}
				>
					{usage}{" "}
					<span style={{ color: emailBrand.muted, fontWeight: "normal" }}>
						/ {limit} {usageUnit}
					</span>
				</Text>
			</Section>

			<Section className="text-center">
				<EmailButton href="https://app.databuddy.cc/billing">
					Review billing settings
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

UsageLimitEmail.PreviewProps = {
	featureDescription: DATABUNNY_USAGE.description,
	featureName: DATABUNNY_USAGE.name,
	isAvailable: false,
	limitAmount: 350,
	limitType: "included",
	nextResetAt: Date.UTC(2026, 7, 1),
	organizationName: "Acme Inc",
	overageAllowed: false,
	pausedActivity: DATABUNNY_USAGE.pausedActivity,
	remainingAmount: 0,
	usageAmount: 350,
	usageUnit: DATABUNNY_USAGE.unit,
} satisfies UsageLimitEmailProps;

export default UsageLimitEmail;
