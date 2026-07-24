"use client";

import Link from "next/link";
import { memo } from "react";
import { cn } from "@/lib/utils";
import {
	type FeatureUsage,
	formatCompactNumber,
	getResetText,
} from "../utils/feature-usage";
import { PricingTiersTooltip } from "./pricing-tiers-tooltip";
import { ChartBarIcon, DatabaseIcon, UsersIcon } from "@databuddy/ui/icons";
import { Badge, Progress, Text } from "@databuddy/ui";

function formatCurrency(amount: number): string {
	if (amount >= 1000) {
		return `$${(amount / 1000).toFixed(1)}K`;
	}
	if (amount >= 1) {
		return `$${amount.toFixed(2)}`;
	}
	return `$${amount.toFixed(4)}`;
}

const FEATURE_ICONS: Record<string, typeof ChartBarIcon> = {
	event: ChartBarIcon,
	storage: DatabaseIcon,
	user: UsersIcon,
	member: UsersIcon,
	message: ChartBarIcon,
	website: ChartBarIcon,
};

function getFeatureIcon(name: string): typeof ChartBarIcon {
	const lowercaseName = name.toLowerCase();
	for (const [key, Icon] of Object.entries(FEATURE_ICONS)) {
		if (lowercaseName.includes(key)) {
			return Icon;
		}
	}
	return ChartBarIcon;
}

export const UsageRow = memo(function UsageRowComponent({
	feature,
	showUpgrade = true,
}: {
	feature: FeatureUsage;
	showUpgrade?: boolean;
}) {
	const used = feature.includedLimit - feature.balance;
	const usedClamped = Math.max(0, used);
	const hasNormalLimit = !(feature.unlimited || feature.hasExtraCredits);
	const hasOverage = feature.overage !== null;
	const isBilledOverage = hasOverage && feature.hasPricedOverage;

	const Icon = getFeatureIcon(feature.name);

	if (isBilledOverage && feature.overage) {
		return (
			<BilledOverageRow feature={feature} Icon={Icon} showUpgrade={showUpgrade} />
		);
	}

	const usedPercent = feature.unlimited
		? 0
		: Math.min(Math.max((usedClamped / feature.includedLimit) * 100, 0), 100);
	const isLow = hasNormalLimit && usedPercent > 80;

	return (
		<div className="px-5 py-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<Icon
							className="size-4 shrink-0 text-muted-foreground"
							weight="duotone"
						/>
						<Text variant="label">{feature.name}</Text>
						{feature.hasExtraCredits && (
							<Badge size="sm" variant="default">
								Bonus
							</Badge>
						)}
						{hasOverage && !isBilledOverage && (
							<Badge size="sm" variant="destructive">
								Limit reached
							</Badge>
						)}
					</div>
					<Text className="mt-0.5 pl-6" tone="muted" variant="caption">
						{getResetText(feature)}
					</Text>
				</div>

				{feature.unlimited ? (
					<Badge variant="default">Unlimited</Badge>
				) : (
					<div className="shrink-0 text-right">
						<Text
							className={cn("font-mono tabular-nums", isLow && "text-warning")}
							variant="label"
						>
							{formatCompactNumber(usedClamped)} /{" "}
							{formatCompactNumber(feature.includedLimit)}
						</Text>
						<Text tone="muted" variant="caption">
							{feature.hasExtraCredits
								? `${formatCompactNumber(feature.balance - feature.includedLimit)} bonus`
								: usedClamped === 0
									? `${formatCompactNumber(feature.includedLimit)} available`
									: `${Math.round(usedPercent)}% used`}
						</Text>
					</div>
				)}
			</div>

			{!feature.unlimited && (
				<div className="mt-3 flex items-center gap-3">
					<Progress
						className="flex-1"
						tone={hasOverage ? "destructive" : isLow ? "warning" : "primary"}
						value={hasOverage ? 100 : usedPercent}
					/>
					{(isLow || hasOverage) && showUpgrade && (
						<Link
							className="shrink-0 font-medium text-primary text-xs hover:underline"
							href="/billing/plans"
						>
							Upgrade
						</Link>
					)}
				</div>
			)}
		</div>
	);
});

function BilledOverageRow({
	feature,
	Icon,
	showUpgrade,
}: {
	feature: FeatureUsage;
	Icon: typeof ChartBarIcon;
	showUpgrade: boolean;
}) {
	const overage = feature.overage;
	if (!overage) {
		return null;
	}

	const totalUsed = feature.limit + overage.amount;
	const includedPercent = Math.max((feature.limit / totalUsed) * 100, 5);

	return (
		<div className="px-5 py-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<Icon
							className="size-4 shrink-0 text-muted-foreground"
							weight="duotone"
						/>
						<Text variant="label">{feature.name}</Text>
						<Badge size="sm" variant="destructive">
							Overage
						</Badge>
					</div>
					<Text className="mt-0.5 pl-6" tone="muted" variant="caption">
						{getResetText(feature)}
					</Text>
				</div>
				<div className="shrink-0 text-right">
					<Text className="font-mono tabular-nums" variant="label">
						{formatCompactNumber(totalUsed)} total
					</Text>
					<Text className="text-destructive tabular-nums" variant="caption">
						+{formatCompactNumber(overage.amount)} over limit
					</Text>
				</div>
			</div>

			<div className="mt-3">
				<div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary p-[1.5px]">
					<div
						className="h-full rounded-l-full bg-primary"
						style={{ width: `${includedPercent}%` }}
					/>
					<div
						className="h-full rounded-r-full bg-primary/30"
						style={{ width: `${100 - includedPercent}%` }}
					/>
				</div>
				<div className="mt-1.5 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1.5">
							<span className="inline-block size-1.5 rounded-full bg-primary" />
							<Text tone="muted" variant="caption">
								{formatCompactNumber(feature.limit)} included
							</Text>
						</span>
						<span className="flex items-center gap-1.5">
							<span className="inline-block size-1.5 rounded-full bg-primary/30" />
							<Text tone="muted" variant="caption">
								{formatCompactNumber(overage.amount)} overage
							</Text>
						</span>
					</div>
					{feature.pricingTiers.length > 0 && (
						<PricingTiersTooltip tiers={feature.pricingTiers} />
					)}
				</div>
			</div>

			<div className="mt-3 flex items-center justify-between rounded-md bg-destructive/5 px-3 py-2">
				<Text tone="muted" variant="caption">
					Estimated overage
				</Text>
				<div className="flex items-center gap-3">
					<Text
						className="font-mono text-destructive tabular-nums"
						variant="label"
					>
						~{formatCurrency(overage.cost)}
					</Text>
					{showUpgrade && (
						<Link
							className="font-medium text-primary text-xs hover:underline"
							href="/billing/plans"
						>
							Upgrade
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}
