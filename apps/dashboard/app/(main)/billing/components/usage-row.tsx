"use client";

import {
	ChartBarIcon,
	ClockIcon,
	DatabaseIcon,
	GiftIcon,
	LightningIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	type FeatureUsage,
	formatCompactNumber,
	getResetText,
} from "../utils/feature-usage";

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
}: {
	feature: FeatureUsage;
}) {
	const used = feature.limit - feature.balance;
	const usedPercent = feature.unlimited
		? 0
		: Math.min(Math.max((used / feature.limit) * 100, 0), 100);
	const hasNormalLimit = !(feature.unlimited || feature.hasExtraCredits);
	const isLow = hasNormalLimit && usedPercent > 80;
	const hasOverage = feature.overage !== null;

	const Icon = getFeatureIcon(feature.name);

	return (
		<div className="px-5 py-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-background">
						<Icon
							className="text-muted-foreground"
							size={18}
							weight="duotone"
						/>
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="font-medium">{feature.name}</span>
							{feature.hasExtraCredits && (
								<Badge variant="secondary">
									<GiftIcon size={10} weight="fill" />
									Bonus
								</Badge>
							)}
							{hasOverage && (
								<Badge
									className="bg-destructive/10 text-destructive"
									variant="secondary"
								>
									<WarningIcon className="mr-1" size={10} weight="fill" />
									Overage
								</Badge>
							)}
						</div>
						<div className="flex items-center gap-1 text-muted-foreground text-sm">
							<ClockIcon size={12} />
							{getResetText(feature)}
						</div>
					</div>
				</div>

				{feature.unlimited ? (
					<Badge variant="secondary">
						<LightningIcon className="mr-1" size={12} />
						Unlimited
					</Badge>
				) : feature.hasExtraCredits ? (
					<div className="text-right">
						<span className="font-mono text-base">
							{formatCompactNumber(used)}
						</span>
						<div className="text-muted-foreground text-xs">used</div>
					</div>
				) : feature.overage ? (
					<div className="text-right">
						<span className="font-mono text-base text-destructive">
							+{formatCompactNumber(feature.overage.amount)} over
						</span>
						<div className="text-destructive text-xs">
							~{formatCurrency(feature.overage.cost)} overage
						</div>
					</div>
				) : (
					<div className="text-right">
						<span
							className={cn(
								"font-mono text-base",
								isLow ? "text-warning" : "text-foreground"
							)}
						>
							{formatCompactNumber(used)} / {formatCompactNumber(feature.limit)}
						</span>
						<div className="text-muted-foreground text-xs">used</div>
					</div>
				)}
			</div>

			{hasNormalLimit && (
				<div className="flex items-center gap-3">
					<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							className={cn(
								"h-full transition-all",
								hasOverage
									? "bg-destructive"
									: isLow
										? "bg-warning"
										: "bg-primary"
							)}
							style={{ width: hasOverage ? "100%" : `${usedPercent}%` }}
						/>
					</div>
					{(isLow || hasOverage) && (
						<Link
							className="shrink-0 font-medium text-primary text-sm hover:underline"
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
