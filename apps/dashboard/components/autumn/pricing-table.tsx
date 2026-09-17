"use client";

import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import {
	FEATURE_METADATA,
	GATED_FEATURES,
	HIDDEN_PRICING_FEATURES,
	INTELLIGENCE_CONTACT_TOPICS,
	normalizePlanId,
	PLAN_FEATURE_LIMITS,
} from "@databuddy/shared/types/features";
import { Badge, Button, Card, EmptyState, Skeleton, Text } from "@databuddy/ui";
import {
	CheckIcon,
	CrownIcon,
	RocketLaunchIcon,
	StarIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Accordion } from "@databuddy/ui/client";
import { useCustomer, useListPlans } from "autumn-js/react";
import { useState } from "react";
import { toast } from "sonner";
import { PricingTiersTooltip } from "@/app/(main)/billing/components/pricing-tiers-tooltip";
import { getStripeMetadata } from "@/app/(main)/billing/utils/stripe-metadata";
import AttachDialog, {
	type AttachDialogProps,
} from "@/components/autumn/attach-dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getCustomerPlanName } from "@/lib/autumn/customer-plan-name";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

type HookPlan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];
type BillingItem = HookPlan["items"][number];
type BillingPreview = AttachDialogProps["preview"];

const CONTACT_TOPICS: Record<string, string | undefined> =
	INTELLIGENCE_CONTACT_TOPICS;
const DISPLAYED_PLAN_IDS = new Set(["hobby", "pro", "intelligence"]);
const PLAN_ICONS: Record<string, typeof CrownIcon> = {
	hobby: RocketLaunchIcon,
	pro: StarIcon,
	intelligence: CrownIcon,
};
const PLAN_TAGLINES: Record<string, string> = {
	hobby: "For solo builders and side projects.",
	pro: "For growing teams shipping production apps.",
	intelligence: "An always-on product investigator for founders and engineers.",
};
const PLAN_SUPPORT: Record<string, string> = {
	hobby: "Email support",
	pro: "Priority email support",
	intelligence: "Priority email + Slack",
};

function formatPriceAmount(amount: number) {
	return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
}

function allowanceText(item: BillingItem, unit: string) {
	const quantity = item.unlimited
		? "Unlimited"
		: formatLocaleNumber(item.included ?? 0);
	const interval = item.reset?.interval;
	const count = item.reset?.intervalCount ?? 1;
	const period =
		interval && interval !== "one_off"
			? ` / ${count > 1 ? `${count} ${interval}s` : interval}`
			: " included";
	return `${quantity} ${unit}${period}`;
}

function getButtonText(
	eligibility: HookPlan["customerEligibility"],
	isSelected: boolean
) {
	if (eligibility?.canceling) {
		return "Resume plan";
	}
	if (eligibility?.status === "active") {
		return "Current plan";
	}
	if (eligibility?.status === "scheduled") {
		return "Scheduled";
	}
	if (isSelected) {
		return "Complete purchase";
	}
	if (eligibility?.trialAvailable) {
		return "Start free trial";
	}
	if (eligibility?.attachAction === "upgrade") {
		return "Upgrade";
	}
	if (eligibility?.attachAction === "downgrade") {
		return "Downgrade";
	}
	return "Get started";
}

export default function PricingTable({
	selectedPlan,
}: {
	selectedPlan?: string | null;
}) {
	const { attach, previewAttach } = useCustomer();
	const { data: plans, isLoading, error } = useListPlans();

	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{[1, 2, 3].map((id) => (
					<Card className="min-h-[340px]" key={id}>
						<Card.Header className="min-h-[104px] flex-row items-start gap-3 bg-transparent p-5">
							<Skeleton className="size-9 shrink-0" />
							<div className="min-w-0 flex-1 space-y-2">
								<Skeleton className="h-5 w-24" />
								<Skeleton className="h-3 w-full" />
							</div>
						</Card.Header>
						<div className="border-border/60 border-y bg-secondary/40 px-5 py-5">
							<Skeleton className="h-9 w-32" />
						</div>
						<Card.Content className="space-y-5 p-5">
							<Skeleton className="h-5 w-40" />
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-9 w-full" />
						</Card.Content>
					</Card>
				))}
			</div>
		);
	}
	if (error) {
		return (
			<EmptyState
				description="Try again in a moment."
				icon={<WarningIcon />}
				title="Couldn't load plans"
				variant="error"
			/>
		);
	}
	const displayedPlans =
		plans?.filter((plan) => DISPLAYED_PLAN_IDS.has(plan.id)) ?? [];
	const investigationTerms = getInvestigationTerms(
		displayedPlans.flatMap((plan) => plan.items)
	);
	return (
		<div className="space-y-4">
			<div className="motion-safe:fade-in motion-safe:slide-in-from-bottom-1 grid items-stretch gap-4 motion-safe:animate-in motion-safe:duration-150 sm:grid-cols-2 lg:grid-cols-3">
				{displayedPlans.map((plan) => (
					<PricingCard
						attachAction={async () => {
							try {
								const result = await attach({
									planId: plan.id,
									metadata: getStripeMetadata(),
									successUrl: `${window.location.origin}/billing`,
								});
								if (result?.paymentUrl) {
									window.location.href = result.paymentUrl;
								} else {
									toast.success("Plan updated");
								}
							} catch (error) {
								toast.error(
									getUserFacingErrorMessage(
										error,
										"We couldn't update your plan. Try again."
									)
								);
								throw error;
							}
						}}
						isSelected={selectedPlan === plan.id}
						key={plan.id}
						plan={plan}
						previewAction={() => previewAttach({ planId: plan.id })}
					/>
				))}
			</div>
			{investigationTerms && (
				<Text className="text-pretty" tone="muted" variant="caption">
					{investigationTerms}
				</Text>
			)}
			<Card>
				<Accordion>
					<Accordion.Trigger>Compare features and AI terms</Accordion.Trigger>
					<Accordion.Panel keepMounted={false}>
						<PlanComparison plans={displayedPlans} />
					</Accordion.Panel>
				</Accordion>
			</Card>
		</div>
	);
}

function PricingCard({
	plan,
	attachAction,
	previewAction,
	isSelected,
}: {
	plan: HookPlan;
	attachAction: () => Promise<void>;
	previewAction: () => Promise<BillingPreview>;
	isSelected: boolean;
}) {
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [preview, setPreview] = useState<BillingPreview | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const eligibility = plan.customerEligibility;
	const isActive = eligibility?.status === "active";
	const planName = getCustomerPlanName(plan.id, plan.name);
	const investigationTerms = getInvestigationTerms(plan.items);
	const contactTopic = CONTACT_TOPICS[plan.id];
	const isRecommended = plan.id === "pro";
	const Icon = PLAN_ICONS[plan.id] ?? CrownIcon;

	return (
		<Card
			className={cn(
				"relative min-h-[340px] transition-[border-color,box-shadow] duration-(--duration-base) ease-(--expo-out) motion-reduce:transition-none",
				isRecommended
					? "border-primary/50 shadow-sm"
					: "focus-within:border-border hover:border-border",
				isSelected && "ring-2 ring-primary/30"
			)}
		>
			{isRecommended && (
				<Badge
					className="pointer-events-none absolute top-0 right-0 rounded-none rounded-bl-md uppercase tracking-wider"
					size="sm"
					variant="primary"
				>
					Most popular
				</Badge>
			)}
			<Card.Header className="min-h-[104px] flex-row items-start gap-3 bg-transparent p-5">
				<div
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-lg border",
						isRecommended
							? "border-primary/30 bg-primary/10 text-primary"
							: "border-border/60 bg-accent text-accent-foreground"
					)}
				>
					<Icon aria-hidden="true" className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<Card.Title className="text-balance text-base">
							{planName}
						</Card.Title>
						{isActive && (
							<Badge size="sm" variant="muted">
								Current
							</Badge>
						)}
						{isSelected && !isActive && (
							<Badge size="sm" variant="primary">
								Selected
							</Badge>
						)}
					</div>
					<Card.Description className="mt-0.5 text-pretty">
						{PLAN_TAGLINES[plan.id] ?? plan.description}
					</Card.Description>
				</div>
			</Card.Header>
			<div className="border-border/60 border-y bg-secondary/40 px-5 py-5">
				<PricingPlanPrice plan={plan} />
			</div>
			<Card.Content className="flex flex-1 flex-col gap-5 p-5">
				<PricingFeatures plan={plan} />
				<div className="mt-auto space-y-3">
					{contactTopic && !isActive ? (
						<Button asChild className="w-full" size="lg" variant="secondary">
							<a
								href={`https://www.databuddy.cc/contact?topic=${contactTopic}`}
								rel="noopener noreferrer"
								target="_blank"
							>
								Request access
							</a>
						</Button>
					) : (
						<Button
							aria-label={getButtonText(eligibility, isSelected)}
							className="w-full"
							disabled={
								!eligibility?.canceling &&
								(isActive || eligibility?.status === "scheduled")
							}
							loading={isLoadingPreview}
							onClick={async () => {
								setIsLoadingPreview(true);
								try {
									setPreview(await previewAction());
									setDialogOpen(true);
								} catch (error) {
									toast.error(
										getUserFacingErrorMessage(
											error,
											"We couldn't load the billing preview. Try again."
										)
									);
								} finally {
									setIsLoadingPreview(false);
								}
							}}
							size="lg"
							variant={
								isActive || !(isRecommended || isSelected)
									? "secondary"
									: "primary"
							}
						>
							{getButtonText(eligibility, isSelected)}
						</Button>
					)}
				</div>
			</Card.Content>
			{preview && (
				<AttachDialog
					action={
						eligibility?.canceling
							? "resume"
							: eligibility?.trialAvailable
								? "trial"
								: eligibility?.attachAction
					}
					onConfirm={attachAction}
					open={dialogOpen}
					planName={planName}
					preview={preview}
					setOpen={setDialogOpen}
					terms={investigationTerms}
				/>
			)}
		</Card>
	);
}

export function getInvestigationTerms(items: HookPlan["items"]) {
	return items.some(
		(item) =>
			item.featureId === INVESTIGATION_USAGE.featureId &&
			((item.included ?? 0) > 0 || item.unlimited || item.price)
	)
		? "Only completed investigations count. Clarifications and repair checks are included."
		: undefined;
}

export function PricingPlanPrice({
	plan,
}: {
	plan: Pick<HookPlan, "id" | "autoEnable" | "price">;
}) {
	const price = plan.price;
	if (!price) {
		return (
			<Text className="text-pretty" tone="muted" variant="body">
				{plan.autoEnable ? "Free" : "No base fee"}
			</Text>
		);
	}
	const count = price.intervalCount ?? 1;
	const interval = count === 1 ? price.interval : `${count} ${price.interval}s`;
	return (
		<div className="flex items-baseline gap-1">
			<span className="font-semibold text-3xl tabular-nums">
				{formatPriceAmount(price.amount)}
			</span>
			<Text tone="muted" variant="body">
				{price.interval === "one_off" ? "one time" : `/ ${interval}`}
			</Text>
		</div>
	);
}

export function PricingFeatures({
	plan,
}: {
	plan: Pick<HookPlan, "id" | "items">;
}) {
	const eventItem =
		plan.items.find(
			(item) => item.featureId === "events" && (item.included || item.unlimited)
		) ?? plan.items.find((item) => item.featureId === "events");
	const eventPrice = plan.items.find(
		(item) => item.featureId === "events" && item.price
	)?.price;
	const eventTiers = eventPrice?.tiers?.filter((tier) => tier !== null);
	const investigations = plan.items.filter(
		(item) => item.featureId === INVESTIGATION_USAGE.featureId
	);
	return (
		<ul className="space-y-3">
			{eventItem && (
				<li className="flex items-start gap-2 text-sm">
					<CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
					<div>
						<span className="tabular-nums">
							{allowanceText(eventItem, "events")}
						</span>
						{eventTiers?.length ? (
							<div className="mt-1">
								<PricingTiersTooltip
									included={eventItem.included ?? 0}
									billingUnits={eventPrice?.billingUnits ?? 1}
									tiers={eventTiers}
								/>
							</div>
						) : eventPrice?.amount == null ? null : (
							<Text className="text-pretty" tone="muted" variant="caption">
								Extra events:{" "}
								{formatPriceAmount(
									(eventPrice.amount * 1000) / (eventPrice.billingUnits ?? 1)
								)}{" "}
								per 1,000
							</Text>
						)}
					</div>
				</li>
			)}
			{getInvestigationTerms(investigations) && (
				<InvestigationFeatureItem items={investigations} />
			)}
			{PLAN_SUPPORT[plan.id] && (
				<StaticFeatureItem label={PLAN_SUPPORT[plan.id]} />
			)}
		</ul>
	);
}

function InvestigationFeatureItem({ items }: { items: BillingItem[] }) {
	const allowance =
		items.find((item) => item.included || item.unlimited) ?? items[0];
	const price = items.find((item) => item.price)?.price;
	const units = price?.billingUnits ?? 1;
	return (
		<li className="flex items-start gap-2 text-sm">
			<CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
			<div>
				<span className="tabular-nums">
					{allowance.included || allowance.unlimited
						? allowanceText(allowance, "investigations")
						: "Investigations"}
				</span>
				{!allowance.unlimited && price && (
					<Text className="text-pretty" tone="muted" variant="caption">
						{price.amount == null
							? "Extra investigation rates vary by tier"
							: `${formatPriceAmount(price.amount)} per ${units === 1 ? "extra investigation" : `${formatLocaleNumber(units)} extra investigations`}`}
						{price.billingMethod === "prepaid" ? " · prepaid" : ""}
					</Text>
				)}
			</div>
		</li>
	);
}

export function PlanComparison({
	plans,
}: {
	plans: Pick<HookPlan, "id" | "name" | "items">[];
}) {
	const hasCreditTerms = plans.some((plan) =>
		plan.items.some((item) => item.featureId === "agent_credits")
	);
	return (
		<Table aria-label="Plan comparison" className="min-w-[540px]" tabIndex={0}>
			<TableHeader>
				<TableRow>
					<TableHead scope="col">Feature</TableHead>
					{plans.map((plan) => (
						<TableHead key={plan.id} scope="col">
							{getCustomerPlanName(plan.id, plan.name)}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{hasCreditTerms && (
					<TableRow>
						<TableHead className="whitespace-normal" scope="row">
							AI credits
						</TableHead>
						{plans.map((plan) => (
							<TableCell
								className="whitespace-normal text-pretty tabular-nums"
								key={plan.id}
							>
								{plan.items
									.filter(
										(item) =>
											item.featureId === "agent_credits" &&
											(item.included || item.unlimited)
									)
									.map((item) => allowanceText(item, "AI credits"))
									.join(" + ") ||
									(plan.items.some(
										(item) => item.featureId === "agent_credits" && item.price
									)
										? "Credits purchased separately"
										: "Not included")}
							</TableCell>
						))}
					</TableRow>
				)}
				{Object.values(GATED_FEATURES)
					.filter((feature) => !HIDDEN_PRICING_FEATURES.includes(feature))
					.map((feature) => (
						<TableRow key={feature}>
							<TableHead scope="row">
								{FEATURE_METADATA[feature].name}
							</TableHead>
							{plans.map((plan) => {
								const limit =
									PLAN_FEATURE_LIMITS[normalizePlanId(plan.id)][feature];
								const value =
									limit === false
										? "Not included"
										: typeof limit === "number"
											? formatLocaleNumber(limit)
											: FEATURE_METADATA[feature].unit
												? "Unlimited"
												: "Included";
								return (
									<TableCell className="tabular-nums" key={plan.id}>
										{value}
									</TableCell>
								);
							})}
						</TableRow>
					))}
			</TableBody>
		</Table>
	);
}

function StaticFeatureItem({ label }: { label: string }) {
	return (
		<li className="flex items-start gap-2 text-sm">
			<CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
			<span>{label}</span>
		</li>
	);
}
