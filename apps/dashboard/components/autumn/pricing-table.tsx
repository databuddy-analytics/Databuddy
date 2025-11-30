"use client";

import {
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
import { createContext, useCallback, useContext, useState } from "react";
import { PricingTiersTooltip } from "@/app/(main)/billing/components/pricing-tiers-tooltip";
import AttachDialog from "@/components/autumn/attach-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPricingTableContent } from "@/lib/autumn/pricing-table-content";
import { cn } from "@/lib/utils";

// Plan icons - matches billing page
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

// Skeleton - matches billing design
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
								<div className="h-4 w-4 rounded bg-muted" />
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

// Context
const PricingTableContext = createContext<{
	products: Product[];
	selectedPlan?: string | null;
}>({ products: [], selectedPlan: null });

function usePricingTableCtx() {
	return useContext(PricingTableContext);
}

// Main component
export default function PricingTable({
	productDetails,
	selectedPlan,
}: {
	productDetails?: ProductDetails[];
	selectedPlan?: string | null;
}) {
	const { attach } = useCustomer();
	const { products, isLoading, error, refetch } = usePricingTable({
		productDetails,
	});

	const handleRetry = useCallback(() => {
		if (typeof refetch === "function") {
			refetch();
		}
	}, [refetch]);

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

	const intervalFilter = (product: Product) => {
		if (!product.properties?.interval_group) {
			return true;
		}
		return true;
	};

	const filteredProducts =
		products?.filter(
			(p) => p.id !== "free" && p.id !== "verification_fee" && intervalFilter(p)
		) ?? [];

	return (
		<div>
			{/* Cards Grid */}
			<PricingTableContext.Provider
				value={{ products: products ?? [], selectedPlan }}
			>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{filteredProducts.map((plan) => (
						<PricingCard
							buttonProps={{
								disabled:
									plan.scenario === "active" || plan.scenario === "scheduled",
								onClick: async () => {
									await attach({ productIds: [plan.id], dialog: AttachDialog });
								},
							}}
							isSelected={selectedPlan === plan.id}
							key={plan.id}
							productId={plan.id}
						/>
					))}
				</div>
			</PricingTableContext.Provider>
		</div>
	);
}

// Pricing Card
function PricingCard({
	productId,
	className,
	buttonProps,
	isSelected = false,
}: {
	productId: string;
	className?: string;
	buttonProps?: React.ComponentProps<"button">;
	isSelected?: boolean;
}) {
	const { products, selectedPlan } = usePricingTableCtx();
	const product = products.find((p) => p.id === productId);

	if (!product) {
		return null;
	}

	const { name, display: productDisplay } = product;
	const { buttonText: defaultButtonText } = getPricingTableContent(product);
	const isRecommended = !!productDisplay?.recommend_text;
	const Icon = getPlanIcon(product.id);

	const buttonText =
		selectedPlan === productId ? (
			<span className="font-semibold">Complete Purchase →</span>
		) : (
			defaultButtonText
		);

	const mainPrice = product.properties?.is_free
		? { primary_text: "Free", secondary_text: "forever" }
		: product.items[0]?.display;

	// Support levels
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

	const featureItems = [
		...(product.properties?.is_free ? product.items : product.items.slice(1)),
		...extraFeatures,
		...(supportItem ? [supportItem] : []),
	];

	return (
		<div
			className={cn(
				"relative flex flex-col rounded border bg-card",
				isRecommended && "border-primary",
				isSelected && "border-primary ring-2 ring-primary/20",
				className
			)}
		>
			{/* Recommended Badge */}
			{isRecommended && (
				<Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
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

			{/* Price */}
			<div className="dotted-bg border-y bg-accent px-5 py-4">
				{product.id === "hobby" ? (
					<div className="flex items-baseline gap-2">
						<span className="text-muted-foreground line-through">$9.99</span>
						<span className="font-semibold text-2xl text-green-600">$2.00</span>
						<span className="text-muted-foreground text-sm">/month</span>
						<Badge variant="secondary">Limited time</Badge>
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

			{/* Features */}
			<div className="flex-1 p-5">
				{product.display?.everything_from && (
					<p className="mb-3 text-muted-foreground text-sm">
						Everything from {product.display.everything_from}, plus:
					</p>
				)}
				<div className="space-y-3">
					{featureItems.map((item) => (
						<FeatureItem item={item} key={item.display?.primary_text} />
					))}
				</div>
			</div>

			{/* Button */}
			<div className="p-5 pt-0">
				<PricingCardButton
					disabled={buttonProps?.disabled}
					onClick={buttonProps?.onClick}
					recommended={isRecommended}
				>
					{buttonText}
				</PricingCardButton>
			</div>
		</div>
	);
}

// Feature Item
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
				className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground"
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

// Button
function PricingCardButton({
	recommended,
	children,
	className,
	onClick,
	disabled,
}: {
	recommended?: boolean;
	children: React.ReactNode;
	className?: string;
	onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
}) {
	const [loading, setLoading] = useState(false);

	const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
		setLoading(true);
		try {
			await onClick?.(e);
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Button
			className={cn("w-full", className)}
			disabled={loading || disabled}
			onClick={handleClick}
			variant={recommended ? "default" : "secondary"}
		>
			{loading ? (
				<CircleNotchIcon className="h-4 w-4 animate-spin" />
			) : (
				children
			)}
		</Button>
	);
}

// Exports for external use
export { PricingCard, FeatureItem as PricingFeatureItem };
