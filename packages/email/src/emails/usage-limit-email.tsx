import { EVENTS_USAGE } from "@databuddy/shared/billing";
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

export type UsageLimitState = "paused" | "overage" | "allowance_used";

const LIMIT_LABELS: Record<UsageLimitType, string> = {
	included: "included allowance",
	max_purchase: "top-up limit",
	spend_limit: "spending limit",
};

export function usageLimitState(
	isAvailable: boolean,
	overageAllowed: boolean
): UsageLimitState {
	if (!isAvailable) {
		return "paused";
	}
	return overageAllowed ? "overage" : "allowance_used";
}

export function usageLimitHeading(
	state: UsageLimitState,
	limitType: UsageLimitType
): string {
	const label = LIMIT_LABELS[limitType];
	if (state === "paused") {
		return `Paused at your ${label}`;
	}
	if (state === "overage") {
		return `Past your ${label}, still running on overage`;
	}
	return `${label.charAt(0).toUpperCase()}${label.slice(1)} used`;
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
	const state = usageLimitState(isAvailable, overageAllowed);
	const resetClause = resetDate
		? `, or wait until the allowance resets ${resetDate} UTC`
		: "";

	let accessStatus: string;
	let detail: string;
	if (state === "overage") {
		accessStatus = `Nothing is paused: ${pausedActivity} keeps running, and usage past your allowance is billed as overage.`;
		detail = `Your billing page shows the overage so far this period and the rate it is charged at${resetDate ? `, and the allowance resets ${resetDate} UTC` : ""}.`;
	} else if (state === "allowance_used") {
		accessStatus = `Nothing is paused: ${pausedActivity} keeps running on the ${remaining} ${usageUnit} you have left.`;
		detail = `Once the remaining ${usageUnit} run out, ${pausedActivity} pauses until you change the billing limit or plan${resetClause}.`;
	} else {
		accessStatus = `Access to ${pausedActivity} is paused.`;
		detail = `Change the billing limit or plan to resume ${pausedActivity}${resetClause}.`;
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
					{featureName}: {usageLimitHeading(state, limitType)}
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
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{detail}
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
					{state === "overage"
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
	featureDescription: EVENTS_USAGE.description,
	featureName: EVENTS_USAGE.name,
	isAvailable: true,
	limitAmount: 1_000_000,
	limitType: "included",
	nextResetAt: Date.UTC(2026, 9, 1),
	organizationName: "Acme Inc",
	overageAllowed: true,
	pausedActivity: EVENTS_USAGE.pausedActivity,
	remainingAmount: 0,
	usageAmount: 1_284_000,
	usageUnit: EVENTS_USAGE.unit,
} satisfies UsageLimitEmailProps;

export default UsageLimitEmail;
