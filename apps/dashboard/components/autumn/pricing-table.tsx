"use client";

import {
	FEATURE_METADATA,
	type FeatureLimit,
	type GatedFeatureId,
	HIDDEN_PRICING_FEATURES,
	PLAN_FEATURE_LIMITS,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import type { PreviewAttachResponse } from "autumn-js";
import { useCustomer, useListPlans } from "autumn-js/react";
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";
import { PricingTiersTooltip } from "@/app/(main)/billing/components/pricing-tiers-tooltip";
import { getStripeMetadata } from "@/app/(main)/billing/utils/stripe-metadata";
import AttachDialog from "@/components/autumn/attach-dialog";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { cn } from "@/lib/utils";
import {
	ArrowsDownUpIcon as TreeIcon,
	CheckIcon,
	CrownIcon,
	LeafIcon,
	LockSimpleIcon as LockKeyIcon,
	ReceiptIcon,
	RocketLaunchIcon,
	ShieldCheckIcon,
	StarIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, EmptyState, Text } from "@databuddy/ui";

const DISPLAYED_PLAN_IDS = ["hobby", "pro", "scale"] as const;
const RECOMMENDED_PLAN_ID = "pro";

const PLAN_ICONS: Record<string, typeof CrownIcon> = {
	free: LeafIcon,
	hobby: RocketLaunchIcon,
	pro: StarIcon,
	scale: CrownIcon,
	buddy: CrownIcon,
};

const PLAN_INTRO_OFFER: Record<string, { amount: number; label: string }> = {
	hobby: { amount: 2, label: "first month" },
};

const INTERVAL_COMPACT: Record<string, string> = {
	day: "day",
	week: "wk",
	month: "mo",
	quarter: "qtr",
	year: "yr",
};

const TRAILING_ZERO_CENTS = /\.00$/;

function formatPriceAmount(amount: number | undefined | null): string {
	if (amount == null) {
		return "";
	}
	const fixed = amount.toFixed(2);
	return `$${fixed.replace(TRAILING_ZERO_CENTS, "")}`;
}

const PLAN_TAGLINES: Record<string, string> = {
	hobby: "For solo builders and side projects.",
	pro: "For growing teams shipping production apps.",
	scale: "For established products at serious scale.",
};

const PLAN_SUPPORT: Record<string, string> = {
	hobby: "Email support",
	pro: "Priority email support",
	scale: "Priority email + Slack",
	buddy: "Priority email + Slack",
};

const PLAN_EXTRAS: Record<string, string[]> = {
	scale: ["White-glove onboarding", "Beta / early access"],
	buddy: ["White-glove onboarding", "Beta / early access"],
};

const PREVIOUS_PLAN_NAME: Record<string, string> = {
	pro: "Hobby",
	scale: "Pro",
};

function getPlanIcon(planId: string) {
	return PLAN_ICONS[planId] || CrownIcon;
}

interface ButtonState {
	disabled: boolean;
	text: string;
	variant: "primary" | "secondary" | "ghost";
}

function getButtonState(
	eligibility:
		| {
				trialAvailable?: boolean;
				status?: string;
				canceling?: boolean;
				attachAction?: string;
		  }
		| null
		| undefined,
	isRecommendedTier: boolean,
	isActivelySelected: boolean
): ButtonState {
	if (eligibility?.status === "active") {
		return { text: "Current plan", variant: "secondary", disabled: true };
	}
	if (eligibility?.status === "scheduled") {
		return { text: "Scheduled", variant: "secondary", disabled: true };
	}
	if (eligibility?.canceling) {
		return { text: "Resume plan", variant: "secondary", disabled: false };
	}
	if (isActivelySelected) {
		return { text: "Complete purchase", variant: "primary", disabled: false };
	}
	if (eligibility?.trialAvailable) {
		return {
			text: "Start free trial",
			variant: isRecommendedTier ? "primary" : "secondary",
			disabled: false,
		};
	}
	switch (eligibility?.attachAction) {
		case "upgrade":
			return {
				text: "Upgrade",
				variant: isRecommendedTier ? "primary" : "secondary",
				disabled: false,
			};
		case "downgrade":
			return { text: "Downgrade", variant: "secondary", disabled: false };
		case "purchase":
			return {
				text: "Get started",
				variant: isRecommendedTier ? "primary" : "secondary",
				disabled: false,
			};
		case "activate":
			return {
				text: "Get started",
				variant: isRecommendedTier ? "primary" : "secondary",
				disabled: false,
			};
		default:
			return {
				text: "Get started",
				variant: isRecommendedTier ? "primary" : "secondary",
				disabled: false,
			};
	}
}

function getNewFeaturesForPlan(planId: string): Array<{
	feature: GatedFeatureId;
	limit: FeatureLimit;
}> {
	const plan = planId as PlanId;
	const planLimits = PLAN_FEATURE_LIMITS[plan];
	if (!planLimits) {
		return [];
	}

	if (plan === PLAN_IDS.FREE) {
		return Object.entries(planLimits)
			.filter(([feature, limit]) => {
				if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
					return false;
				}
				return limit !== false;
			})
			.map(([feature, limit]) => ({
				feature: feature as GatedFeatureId,
				limit,
			}));
	}

	const tierOrder: PlanId[] = [
		PLAN_IDS.FREE,
		PLAN_IDS.HOBBY,
		PLAN_IDS.PRO,
		PLAN_IDS.SCALE,
	];
	const currentIndex = tierOrder.indexOf(plan);
	const previousPlan = tierOrder[currentIndex - 1];
	const previousLimits = PLAN_FEATURE_LIMITS[previousPlan] ?? {};

	return Object.entries(planLimits)
		.filter(([feature, limit]) => {
			if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
				return false;
			}
			if (limit === false) {
				return false;
			}
			const previousLimit = previousLimits[feature as GatedFeatureId];
			if (previousLimit === false) {
				return true;
			}
			if (limit === "unlimited" && previousLimit !== "unlimited") {
				return true;
			}
			if (
				typeof limit === "number" &&
				typeof previousLimit === "number" &&
				limit > previousLimit
			) {
				return true;
			}
			return false;
		})
		.map(([feature, limit]) => ({
			feature: feature as GatedFeatureId,
			limit,
		}));
}

function PricingTableSkeleton() {
	return (
		<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{[1, 2, 3].map((i) => (
				<div
					className="flex h-[520px] w-full animate-pulse flex-col rounded-lg border border-border/60 bg-card"
					key={i}
				>
					<div className="flex items-start gap-3 p-5">
						<div className="size-9 shrink-0 rounded-lg bg-muted" />
						<div className="flex-1 space-y-2">
							<div className="h-4 w-24 rounded bg-muted" />
							<div className="h-3 w-40 rounded bg-muted" />
						</div>
					</div>
					<div className="border-border/60 border-y bg-secondary/40 px-5 py-5">
						<div className="h-8 w-28 rounded bg-muted" />
					</div>
					<div className="flex-1 space-y-2.5 p-5">
						{[1, 2, 3, 4, 5].map((j) => (
							<div className="flex items-center gap-2" key={j}>
								<div className="size-4 rounded bg-muted" />
								<div className="h-3 flex-1 rounded bg-muted" />
							</div>
						))}
					</div>
					<div className="p-5 pt-0">
						<div className="h-9 w-full rounded-md bg-muted" />
					</div>
				</div>
			))}
		</div>
	);
}

type HookPlan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];

const PricingTableContext = createContext<{
	plans: HookPlan[];
	selectedPlan?: string | null;
}>({ plans: [], selectedPlan: null });

function usePricingTableCtx() {
	return useContext(PricingTableContext);
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
			<div className="flex flex-col items-center">
				<PricingTableSkeleton />
				<Text className="mt-4" tone="muted" variant="body">
					Loading plans…
				</Text>
			</div>
		);
	}

	if (error) {
		return (
			<EmptyState
				className="flex h-full flex-col items-center justify-center"
				description="Something went wrong while loading pricing plans"
				icon={<WarningIcon />}
				title="Failed to load pricing plans"
				variant="error"
			/>
		);
	}

	const filteredPlans =
		plans?.filter((p) =>
			(DISPLAYED_PLAN_IDS as readonly string[]).includes(p.id)
		) ?? [];

	return (
		<PricingTableContext.Provider value={{ plans: plans ?? [], selectedPlan }}>
			<div className="flex flex-col gap-6">
				<div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{filteredPlans.map((plan) => (
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
										return;
									}
									toast.success("Plan updated");
								} catch (err) {
									toast.error(
										err instanceof Error
											? err.message
											: "Failed to attach plan."
									);
								}
							}}
							isSelected={selectedPlan === plan.id}
							key={plan.id}
							planId={plan.id}
							previewAction={async () => {
								const result = await previewAttach({ planId: plan.id });
								return result as unknown as PreviewAttachResponse;
							}}
						/>
					))}
				</div>

				<div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-muted-foreground text-xs">
					<span className="inline-flex items-center gap-1.5">
						<ShieldCheckIcon className="size-3.5" weight="duotone" />
						Cancel anytime
					</span>
					<span className="inline-flex items-center gap-1.5">
						<LockKeyIcon className="size-3.5" weight="duotone" />
						Secure Stripe checkout
					</span>
					<span className="inline-flex items-center gap-1.5">
						<ReceiptIcon className="size-3.5" weight="duotone" />
						No hidden fees
					</span>
					<a
						className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
						href="https://stripe.com/climate"
						rel="noreferrer"
						target="_blank"
					>
						<TreeIcon className="size-3.5" weight="duotone" />
						1% goes to carbon removal
					</a>
				</div>
			</div>
		</PricingTableContext.Provider>
	);
}

function PricingCard({
	planId,
	className,
	attachAction,
	previewAction,
	isSelected = false,
}: {
	planId: string;
	className?: string;
	attachAction?: () => Promise<void>;
	previewAction?: () => Promise<PreviewAttachResponse>;
	isSelected?: boolean;
}) {
	const { plans, selectedPlan } = usePricingTableCtx();
	const [isAttaching, setIsAttaching] = useState(false);
	const [preview, setPreview] = useState<PreviewAttachResponse | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const plan = plans.find((p) => p.id === planId);

	if (!plan) {
		return null;
	}

	const eligibility = plan.customerEligibility;
	const Icon = getPlanIcon(plan.id);
	const isActive = eligibility?.status === "active";
	const isRecommended = plan.id === RECOMMENDED_PLAN_ID;
	const isActivelySelected = selectedPlan === planId;

	const buttonState = getButtonState(
		eligibility,
		isRecommended,
		isActivelySelected
	);

	const handleUpgradeClick = async () => {
		if (!previewAction) {
			setIsAttaching(true);
			try {
				await attachAction?.();
			} catch {
				// no-op
			}
			setIsAttaching(false);
			return;
		}

		setIsAttaching(true);
		try {
			const result = await previewAction();
			setPreview(result);
			setDialogOpen(true);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to preview plan."
			);
		} finally {
			setIsAttaching(false);
		}
	};

	const isFree = plan.autoEnable === true;
	const priceAmount = plan.price?.amount;
	const priceInterval = plan.price?.interval;
	const compactUnit = priceInterval
		? (INTERVAL_COMPACT[priceInterval] ?? priceInterval)
		: null;
	const introOffer = PLAN_INTRO_OFFER[plan.id];

	const support = PLAN_SUPPORT[plan.id];
	const extras = PLAN_EXTRAS[plan.id] ?? [];
	const previousPlanName = PREVIOUS_PLAN_NAME[plan.id];

	const billingItems = isFree ? plan.items : plan.items.slice(1);
	const groupedBillingItems = groupItemsByFeature(billingItems);
	const newGatedFeatures = getNewFeaturesForPlan(plan.id);

	return (
		<div
			className={cn(
				"group relative flex flex-col overflow-hidden rounded-lg border bg-card",
				"transition-[border-color,box-shadow] duration-(--duration-base) ease-(--expo-out)",
				isRecommended
					? "border-primary/50 shadow-sm"
					: "border-border/60 hover:border-border",
				isSelected && "ring-2 ring-primary/30",
				className
			)}
		>
			{isRecommended && (
				<div className="pointer-events-none absolute top-0 right-0">
					<div className="rounded-bl-md bg-primary px-2.5 py-1 font-medium text-[10px] text-primary-foreground uppercase tracking-wider">
						Most popular
					</div>
				</div>
			)}

			<div className="flex items-start gap-3 p-5">
				<div
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-lg border",
						isRecommended
							? "border-primary/30 bg-primary/10"
							: "border-border/60 bg-accent"
					)}
				>
					<Icon
						className={cn(
							"size-4",
							isRecommended ? "text-primary" : "text-accent-foreground"
						)}
						weight="duotone"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<Text as="h3" className="font-semibold text-base" variant="body">
							{plan.name}
						</Text>
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
					<Text className="mt-0.5" tone="muted" variant="caption">
						{PLAN_TAGLINES[plan.id] ?? plan.description}
					</Text>
				</div>
			</div>

			<div className="border-border/60 border-y bg-secondary/40 px-5 py-5">
				{isFree ? (
					<div className="flex items-baseline gap-1.5">
						<span className="font-semibold text-3xl text-foreground tracking-tight">
							Free
						</span>
						<Text tone="muted" variant="body">
							forever
						</Text>
					</div>
				) : introOffer ? (
					<div className="space-y-1">
						<div className="flex items-baseline gap-1.5">
							<span className="font-semibold text-3xl text-foreground tabular-nums tracking-tight">
								{formatPriceAmount(introOffer.amount)}
							</span>
							<Text tone="muted" variant="body">
								for your {introOffer.label}
							</Text>
						</div>
						<Text tone="muted" variant="caption">
							then {formatPriceAmount(priceAmount)}
							{compactUnit ? `/${compactUnit}` : ""}
						</Text>
					</div>
				) : (
					<div className="flex items-baseline text-foreground">
						<span className="font-semibold text-3xl tabular-nums tracking-tight">
							{formatPriceAmount(priceAmount)}
						</span>
						{compactUnit && (
							<span className="ml-0.5 font-medium text-base text-muted-foreground">
								/{compactUnit}
							</span>
						)}
					</div>
				)}
			</div>

			<div className="flex flex-1 flex-col gap-4 p-5">
				{previousPlanName && (
					<Text tone="muted" variant="label">
						Everything in {previousPlanName}, plus:
					</Text>
				)}
				<ul className="space-y-2.5">
					{groupedBillingItems.map((group) => (
						<FeatureItem
							group={group}
							key={`${group[0].featureId}-${group[0].display?.primaryText}`}
						/>
					))}
					{newGatedFeatures.map(({ feature, limit }) => {
						const meta = FEATURE_METADATA[feature];
						return (
							<GatedFeatureItem
								key={feature}
								limit={limit}
								name={meta?.name ?? feature}
								unit={meta?.unit}
							/>
						);
					})}
					{extras.map((label) => (
						<StaticFeatureItem key={label} label={label} />
					))}
					{support && <StaticFeatureItem label={support} />}
				</ul>
			</div>

			<div className="p-5 pt-0">
				<Button
					className="w-full"
					disabled={buttonState.disabled}
					loading={isAttaching}
					onClick={handleUpgradeClick}
					size="lg"
					variant={buttonState.variant}
				>
					{buttonState.text}
				</Button>
			</div>

			{preview && (
				<AttachDialog
					onConfirm={async () => {
						await attachAction?.();
					}}
					open={dialogOpen}
					planId={plan.id}
					preview={preview}
					setOpen={setDialogOpen}
				/>
			)}
		</div>
	);
}

interface FeatureItemDisplay {
	display?: { primaryText?: string; secondaryText?: string };
	featureId?: string;
	included?: number;
	price?: {
		tiers?: Array<{ to: number | "inf"; amount: number } | null> | null;
	} | null;
	reset?: { interval?: string | null } | null;
}

const INTERVAL_ADVERB: Record<string, string> = {
	day: "daily",
	week: "weekly",
	month: "monthly",
	quarter: "quarterly",
	year: "yearly",
};

function intervalRank(interval?: string | null): number {
	switch (interval) {
		case "year":
			return 5;
		case "quarter":
			return 4;
		case "month":
			return 3;
		case "week":
			return 2;
		case "day":
			return 1;
		default:
			return 0;
	}
}

function groupItemsByFeature<T extends FeatureItemDisplay>(items: T[]): T[][] {
	const byFeature = new Map<string, T[]>();
	const order: string[] = [];
	for (const item of items) {
		const key = item.featureId ?? item.display?.primaryText ?? "";
		if (!byFeature.has(key)) {
			byFeature.set(key, []);
			order.push(key);
		}
		byFeature.get(key)?.push(item);
	}
	return order.map((key) => {
		const group = byFeature.get(key) ?? [];
		return [...group].sort(
			(a, b) =>
				intervalRank(b.reset?.interval) - intervalRank(a.reset?.interval)
		);
	});
}

function FeatureItem({ group }: { group: FeatureItemDisplay[] }) {
	const primary = group[0];
	const extras = group.slice(1);
	const rawTiers = primary.price?.tiers;
	const tiers = rawTiers?.filter(
		(t): t is { to: number | "inf"; amount: number } => t !== null
	);
	const hasTiers = tiers && tiers.length > 0;

	let secondaryText = primary.display?.secondaryText;
	if (hasTiers) {
		const firstPaidTier = tiers.find((t) => t.amount > 0);
		secondaryText = firstPaidTier
			? `then $${firstPaidTier.amount.toFixed(6)}/event`
			: "Included";
	}

	const extraFragments = extras
		.map((item) => {
			const interval = item.reset?.interval ?? undefined;
			const adverb = interval ? INTERVAL_ADVERB[interval] : undefined;
			if (!(item.included && adverb)) {
				return null;
			}
			return `+${formatLocaleNumber(item.included)} ${adverb}`;
		})
		.filter((x): x is string => Boolean(x));

	const combinedSecondary = [secondaryText, ...extraFragments]
		.filter(Boolean)
		.join(" · ");

	return (
		<li className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-[3px] size-4 shrink-0 text-success"
				weight="bold"
			/>
			<div className="min-w-0 flex-1">
				<span className="text-foreground">{primary.display?.primaryText}</span>
				{combinedSecondary && (
					<div className="flex items-center gap-1">
						<Text tone="muted" variant="caption">
							{combinedSecondary}
						</Text>
						{hasTiers && <PricingTiersTooltip showText={false} tiers={tiers} />}
					</div>
				)}
			</div>
		</li>
	);
}

function GatedFeatureItem({
	name,
	limit,
	unit,
}: {
	name: string;
	limit: FeatureLimit;
	unit?: string;
}) {
	const limitText = (() => {
		if (limit === "unlimited") {
			return "Unlimited";
		}
		if (typeof limit === "number") {
			if (unit) {
				return `Up to ${formatLocaleNumber(limit)} ${unit}`;
			}
			return `Up to ${formatLocaleNumber(limit)}`;
		}
		return null;
	})();

	return (
		<li className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-[3px] size-4 shrink-0 text-success"
				weight="bold"
			/>
			<div className="min-w-0 flex-1">
				<span className="text-foreground">{name}</span>
				{limitText && (
					<Text tone="muted" variant="caption">
						{limitText}
					</Text>
				)}
			</div>
		</li>
	);
}

function StaticFeatureItem({ label }: { label: string }) {
	return (
		<li className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-[3px] size-4 shrink-0 text-success"
				weight="bold"
			/>
			<span className="text-foreground">{label}</span>
		</li>
	);
}

export { FeatureItem as PricingFeatureItem, PricingCard };
