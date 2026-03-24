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
import {
	ArrowDownIcon,
	CheckIcon,
	CircleNotchIcon,
	CrownIcon,
	RocketLaunchIcon,
	SparkleIcon,
	StarIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import type { Product, ProductItem } from "autumn-js";
import {
	type ProductDetails,
	useCustomer,
	usePricingTable,
} from "autumn-js/react";
import { createContext, useContext, useState } from "react";
import { PricingTiersTooltip } from "@/app/(main)/billing/components/pricing-tiers-tooltip";
import { getStripeMetadata } from "@/app/(main)/billing/utils/stripe-metadata";
import AttachDialog from "@/components/autumn/attach-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getPricingTableContent } from "@/lib/autumn/pricing-table-content";
import { cn } from "@/lib/utils";

const PLAN_ICONS: Record<string, typeof CrownIcon> = {
	free: SparkleIcon,
	hobby: RocketLaunchIcon,
	pro: StarIcon,
	scale: CrownIcon,
	buddy: CrownIcon,
};

function getPlanIcon(planId: string) {
	return PLAN_ICONS[planId] || CrownIcon;
}

function getNewFeaturesForPlan(planId: string): Array<{
	feature: GatedFeatureId;
	limit: FeatureLimit;
	isNew: boolean;
}> {
	const plan = planId as PlanId;
	const planLimits = PLAN_FEATURE_LIMITS[plan];
	if (!planLimits) {
		return [];
	}

	if (plan === PLAN_IDS.FREE) {
		return Object.entries(planLimits)
			.filter(([feature, limit]) => {
				// Filter out hidden features
				if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
					return false;
				}
				return limit !== false;
			})
			.map(([feature, limit]) => ({
				feature: feature as GatedFeatureId,
				limit,
				isNew: true,
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
			// Filter out hidden features
			if (HIDDEN_PRICING_FEATURES.includes(feature as GatedFeatureId)) {
				return false;
			}
			if (limit === false) {
				return false;
			}
			const previousLimit = previousLimits[feature as GatedFeatureId];
			// Show if: newly enabled, or limit increased
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
			isNew:
				previousLimits[feature as GatedFeatureId] === false ||
				previousLimits[feature as GatedFeatureId] === undefined,
		}));
}

function PricingTableSkeleton() {
	return (
		<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{[1, 2, 3].map((i) => (
				<div
					className="flex h-96 w-full animate-pulse flex-col rounded border p-5"
					key={i}
				>
					<div className="mb-4 flex items-center gap-3">
						<div className="h-11 w-11 rounded border bg-muted" />
						<div className="flex-1 space-y-2">
							<div className="h-5 w-24 rounded bg-muted" />
							<div className="h-3 w-32 rounded bg-muted" />
						</div>
					</div>
					<div className="mb-4 border-y py-4">
						<div className="h-7 w-20 rounded bg-muted" />
					</div>
					<div className="flex-1 space-y-3">
						{[1, 2, 3, 4].map((j) => (
							<div className="flex items-center gap-2" key={j}>
								<div className="size-4 rounded bg-muted" />
								<div className="h-4 flex-1 rounded bg-muted" />
							</div>
						))}
					</div>
					<div className="mt-4 h-10 w-full rounded bg-muted" />
				</div>
			))}
		</div>
	);
}

const PricingTableContext = createContext<{
	products: Product[];
	selectedPlan?: string | null;
}>({ products: [], selectedPlan: null });

function usePricingTableCtx() {
	return useContext(PricingTableContext);
}

export default function PricingTable({
	productDetails,
	selectedPlan,
}: {
	productDetails?: ProductDetails[];
	selectedPlan?: string | null;
}) {
	const { attach } = useCustomer();
	const { products, isLoading, error } = usePricingTable({
		productDetails,
	});

	if (isLoading) {
		return (
			<div className="flex flex-col items-center">
				<PricingTableSkeleton />
				<span className="mt-4 text-muted-foreground text-sm">
					Loading plans…
				</span>
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

	const filteredProducts =
		products?.filter((p) => ["hobby", "pro", "scale"].includes(p.id)) ?? [];

	return (
		<PricingTableContext.Provider
			value={{ products: products ?? [], selectedPlan }}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{filteredProducts.map((plan) => (
					<PricingCard
						attachAction={async () => {
							await attach({
								productId: plan.id,
								dialog: AttachDialog,
								metadata: getStripeMetadata(),
								...(plan.id === "hobby" && { reward: "SAVE80" }),
							});
						}}
						isSelected={selectedPlan === plan.id}
						key={plan.id}
						productId={plan.id}
					/>
				))}
			</div>
		</PricingTableContext.Provider>
	);
}

function DowngradeConfirmDialog({
	isOpen,
	onClose,
	onConfirm,
	productName,
	currentProductName,
}: {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	productName: string;
	currentProductName?: string;
}) {
	const [isConfirming, setIsConfirming] = useState(false);

	const handleConfirm = async () => {
		setIsConfirming(true);
		try {
			await onConfirm();
		} catch {
			// Error handled by onConfirm
		}
		setIsConfirming(false);
	};

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Downgrade to {productName}</DialogTitle>
					<DialogDescription>
						{currentProductName
							? `Are you sure you want to downgrade from ${currentProductName} to ${productName}? Your current subscription will be cancelled and the new plan will begin at the end of your current billing period.`
							: `Are you sure you want to downgrade to ${productName}? Your current subscription will be cancelled and the new plan will begin at the end of your current billing period.`}
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-3 py-2">
					<div className="flex size-10 shrink-0 items-center justify-center border border-amber-500/20 bg-amber-500/10">
						<ArrowDownIcon
							className="text-amber-600 dark:text-amber-400"
							size={18}
							weight="duotone"
						/>
					</div>
					<p className="text-foreground text-sm">
						You may lose access to features included in your current plan.
					</p>
				</div>
				<DialogFooter>
					<Button disabled={isConfirming} onClick={onClose} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={isConfirming}
						onClick={handleConfirm}
						variant="default"
					>
						{isConfirming ? "Confirming..." : "Confirm Downgrade"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PricingCard({
	productId,
	className,
	attachAction,
	isSelected = false,
}: {
	productId: string;
	className?: string;
	attachAction?: () => Promise<void>;
	isSelected?: boolean;
}) {
	const { products, selectedPlan } = usePricingTableCtx();
	const { attach } = useCustomer();
	const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
	const [isAttaching, setIsAttaching] = useState(false);
	const product = products.find((p) => p.id === productId);

	if (!product) {
		return null;
	}

	const { name, display: productDisplay } = product;
	const { buttonText: defaultButtonText } = getPricingTableContent(product);
	const isRecommended = !!productDisplay?.recommend_text;
	const Icon = getPlanIcon(product.id);
	const isDowngrade = product.scenario === "downgrade";
	const isDisabled =
		product.scenario === "active" || product.scenario === "scheduled";

	const currentProduct = products.find(
		(p) => p.scenario === "active" || p.scenario === "scheduled"
	);
	const currentProductName =
		currentProduct?.display?.name || currentProduct?.name;

	const buttonText =
		selectedPlan === productId ? (
			<span className="font-semibold">Complete Purchase →</span>
		) : (
			defaultButtonText
		);

	const handleUpgradeClick = async () => {
		if (isDowngrade) {
			setShowDowngradeDialog(true);
			return;
		}

		setIsAttaching(true);
		try {
			await attachAction?.();
		} catch {
			// Error handled by attachAction
		}
		setIsAttaching(false);
	};

	const mainPrice = product.properties?.is_free
		? { primary_text: "Free", secondary_text: "forever" }
		: product.items[0]?.display;

	const supportLevels: Record<string, string> = {
		free: "Community Support",
		hobby: "Email Support",
		pro: "Priority Email Support",
		scale: "Priority Email + Slack Support",
		buddy: "Priority Email + Slack Support",
	};

	const extraFeatures = ["scale", "buddy"].includes(product.id)
		? [
				{ display: { primary_text: "White Glove Onboarding" } },
				{ display: { primary_text: "Beta/Early Access" } },
			]
		: [];

	const supportItem = supportLevels[product.id]
		? { display: { primary_text: supportLevels[product.id] } }
		: null;

	// Autumn billing features (usage limits, etc.)
	const billingItems = [
		...(product.properties?.is_free ? product.items : product.items.slice(1)),
		...extraFeatures,
		...(supportItem ? [supportItem] : []),
	];

	// Gated features new to this plan
	const newGatedFeatures = getNewFeaturesForPlan(product.id);

	return (
		<div
			className={cn(
				"relative flex flex-col rounded border bg-card",
				isRecommended && "border-primary",
				isSelected && "border-primary ring-2 ring-primary/20",
				className
			)}
		>
			{isRecommended && (
				<Badge className="absolute top-3 right-3 bg-brand-purple text-white">
					<StarIcon className="mr-1" size={12} weight="fill" />
					{productDisplay?.recommend_text}
				</Badge>
			)}

			<div className="flex items-center gap-3 p-5 pb-4">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-accent">
					<Icon className="text-accent-foreground" size={16} weight="duotone" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate font-semibold">
							{productDisplay?.name || name}
						</h3>
						{isSelected && (
							<Badge className="shrink-0" variant="secondary">
								Selected
							</Badge>
						)}
					</div>
					{productDisplay?.description && (
						<p className="truncate text-muted-foreground text-sm">
							{productDisplay.description}
						</p>
					)}
				</div>
			</div>

			<div className="dotted-bg border-y bg-accent px-5 py-4">
				{product.id === "hobby" ? (
					<div className="flex flex-col gap-1">
						<div className="flex items-baseline gap-1">
							<span className="font-semibold text-2xl">$2</span>
							<span className="text-muted-foreground text-sm">first month</span>
						</div>
						<span className="text-muted-foreground text-xs">
							then $10/month
						</span>
					</div>
				) : (
					<div className="flex items-baseline gap-1">
						<span className="font-semibold text-2xl">
							{mainPrice?.primary_text}
						</span>
						{mainPrice?.secondary_text && (
							<span className="text-muted-foreground text-sm">
								{mainPrice.secondary_text}
							</span>
						)}
					</div>
				)}
			</div>

			<div className="flex-1 p-5">
				{product.display?.everything_from && (
					<p className="mb-3 text-muted-foreground text-sm">
						Everything from {product.display.everything_from}, plus:
					</p>
				)}

				{/* Billing features (usage limits) */}
				<div className="space-y-2.5">
					{billingItems.map((item) => (
						<FeatureItem item={item} key={item.display?.primary_text} />
					))}
				</div>

				{/* Gated features new to this plan */}
				{newGatedFeatures.length > 0 && (
					<div className="mt-4 space-y-2.5 border-t pt-4">
						<span className="text-muted-foreground text-xs uppercase">
							Features Included
						</span>
						{newGatedFeatures.map(({ feature, limit, isNew }) => {
							const meta = FEATURE_METADATA[feature];
							return (
								<GatedFeatureItem
									isNew={isNew}
									key={feature}
									limit={limit}
									name={meta?.name ?? feature}
									unit={meta?.unit}
								/>
							);
						})}
					</div>
				)}
			</div>

			<div className="p-5 pt-0">
				<Button
					className="w-full"
					disabled={isDisabled || isAttaching}
					onClick={handleUpgradeClick}
					variant={isRecommended ? "default" : "secondary"}
				>
					{isAttaching ? (
						<CircleNotchIcon className="size-4 animate-spin" />
					) : (
						buttonText
					)}
				</Button>
			</div>

			<DowngradeConfirmDialog
				currentProductName={currentProductName}
				isOpen={showDowngradeDialog}
				onClose={() => setShowDowngradeDialog(false)}
				onConfirm={async () => {
					setShowDowngradeDialog(false);
					setIsAttaching(true);
					try {
						await attach({
							productId: product.id,
							dialog: AttachDialog,
							metadata: getStripeMetadata(),
							...(product.id === "hobby" && { reward: "SAVE80" }),
						});
					} catch {
						// Error handled by attach
					}
					setIsAttaching(false);
				}}
				productName={productDisplay?.name || name}
			/>
		</div>
	);
}

function FeatureItem({ item }: { item: ProductItem }) {
	const featureItem = item as ProductItem & {
		tiers?: { to: number | "inf"; amount: number }[];
	};
	const hasTiers = featureItem.tiers && featureItem.tiers.length > 0;

	let secondaryText = featureItem.display?.secondary_text;
	if (hasTiers && featureItem.tiers) {
		const firstPaidTier = featureItem.tiers.find((t) => t.amount > 0);
		secondaryText = firstPaidTier
			? `then $${firstPaidTier.amount.toFixed(6)}/event`
			: "Included";
	}

	return (
		<div className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-0.5 size-4 shrink-0 text-accent-foreground"
				weight="bold"
			/>
			<div className="flex flex-col">
				<span>{featureItem.display?.primary_text}</span>
				{secondaryText && (
					<div className="flex items-center gap-1">
						<span className="text-muted-foreground text-xs">
							{secondaryText}
						</span>
						{hasTiers && featureItem.tiers && (
							<PricingTiersTooltip showText={false} tiers={featureItem.tiers} />
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function GatedFeatureItem({
	name,
	limit,
	unit,
	isNew,
}: {
	name: string;
	limit: FeatureLimit;
	unit?: string;
	isNew?: boolean;
}) {
	const getLimitText = () => {
		if (limit === "unlimited") {
			return "Unlimited";
		}
		if (typeof limit === "number") {
			if (unit) {
				return `Up to ${limit.toLocaleString()} ${unit}`;
			}
			return `Up to ${limit.toLocaleString()}`;
		}
		return null;
	};

	const limitText = getLimitText();

	return (
		<div className="flex items-start gap-2 text-sm">
			<CheckIcon
				className="mt-0.5 size-4 shrink-0 text-accent-foreground"
				weight="bold"
			/>
			<div className="flex flex-col">
				<div className="flex items-center gap-2">
					<span>{name}</span>
					{isNew && (
						<Badge className="bg-brand-purple/10 text-brand-purple text-xs">New</Badge>
					)}
				</div>
				{limitText && (
					<span className="text-muted-foreground text-xs">{limitText}</span>
				)}
			</div>
		</div>
	);
}

export { FeatureItem as PricingFeatureItem, PricingCard };
