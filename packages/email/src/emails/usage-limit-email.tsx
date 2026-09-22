import { Heading, Link, Section, Text } from "@react-email/components";
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

const PAUSED_HEADINGS: Record<UsageLimitType, string> = {
	included: "Paused at your included allowance",
	max_purchase: "Paused at your top-up limit",
	spend_limit: "Paused at your spending limit",
};

const REMAINING_HEADINGS: Record<UsageLimitType, string> = {
	included: "Included allowance used",
	max_purchase: "Top-up limit reached",
	spend_limit: "Spending limit reached",
};

function getHeading(
	limitType: UsageLimitType,
	isAvailable: boolean,
	overageAllowed: boolean
): string {
	if (!isAvailable) {
		return PAUSED_HEADINGS[limitType];
	}
	if (overageAllowed) {
		return "Still running, now billing overage";
	}
	return REMAINING_HEADINGS[limitType];
}

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
	const continuesOnOverage = isAvailable && overageAllowed;
	let accessStatus: string;
	if (continuesOnOverage) {
		accessStatus = `Nothing is paused: ${pausedActivity} keeps running, and usage past your allowance is billed as overage.`;
	} else if (isAvailable) {
		accessStatus = `Nothing is paused: ${pausedActivity} keeps running on the ${remaining} ${usageUnit} you have left.`;
	} else {
		accessStatus = `Access to ${pausedActivity} is paused.`;
	}

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
					{featureName}: {getHeading(limitType, isAvailable, overageAllowed)}
				</Heading>
			</Section>

			<Section
				className="my-5 rounded p-4"
				style={{
					backgroundColor: emailBrand.inset,
					border: `1px solid ${isAvailable ? emailBrand.border : emailBrand.amber}`,
				}}
			>
				<Text
					className="m-0 text-center font-semibold text-sm leading-relaxed"
					style={{
						color: isAvailable ? emailBrand.foreground : emailBrand.amber,
					}}
				>
					{accessStatus}
				</Text>
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
				{!isAvailable && (
					<Text
						className="m-0 mb-4 text-sm leading-relaxed"
						style={{ color: emailBrand.muted }}
					>
						{`Change the billing limit or plan to resume it${resetDate ? `, or wait until the allowance resets ${resetDate} UTC` : ""}.`}
					</Text>
				)}
				{continuesOnOverage && (
					<Text
						className="m-0 mb-4 text-sm leading-relaxed"
						style={{ color: emailBrand.muted }}
					>
						Your billing page shows the overage so far this period and the rate
						it is charged at
						{resetDate ? `, and the allowance resets ${resetDate} UTC` : ""}.
					</Text>
				)}
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
					{continuesOnOverage
						? "See your overage so far"
						: "Review billing settings"}
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
	featureDescription:
		"Events include page views, custom events, errors, and Web Vitals collected by Databuddy.",
	featureName: "Event tracking",
	isAvailable: true,
	limitAmount: 1_000_000,
	limitType: "included",
	nextResetAt: Date.UTC(2026, 9, 1),
	organizationName: "Acme Inc",
	overageAllowed: true,
	pausedActivity: "new event collection",
	remainingAmount: 0,
	usageAmount: 1_284_000,
	usageUnit: "events",
} satisfies UsageLimitEmailProps;

export default UsageLimitEmail;
