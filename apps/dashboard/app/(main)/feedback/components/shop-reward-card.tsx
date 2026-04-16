"use client";

import { LightningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShopRewardCardProps {
	availableCredits: number;
	creditsRequired: number;
	isRedeeming: boolean;
	onRedeemAction: () => void;
	rewardAmount: number;
	rewardType: string;
}

export function ShopRewardCard({
	creditsRequired,
	rewardAmount,
	rewardType,
	availableCredits,
	onRedeemAction,
	isRedeeming,
}: ShopRewardCardProps) {
	const canAfford = availableCredits >= creditsRequired;
	const rate = Math.round(rewardAmount / creditsRequired);

	return (
		<div
			className={cn(
				"flex flex-col justify-between gap-4 rounded border p-4 transition-colors",
				canAfford ? "bg-card" : "opacity-50"
			)}
		>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex size-9 shrink-0 items-center justify-center rounded border bg-secondary">
						<LightningIcon
							className="text-accent-foreground"
							size={16}
							weight="duotone"
						/>
					</div>
					<span className="text-muted-foreground text-xs tabular-nums">
						{rate} {rewardType}/credit
					</span>
				</div>
				<div>
					<p className="font-semibold text-lg tabular-nums">
						{rewardAmount.toLocaleString()}
					</p>
					<p className="text-muted-foreground text-sm">{rewardType}</p>
				</div>
			</div>
			<Button
				className="w-full"
				disabled={!canAfford || isRedeeming}
				onClick={onRedeemAction}
				size="sm"
				type="button"
				variant={canAfford ? "default" : "outline"}
			>
				{isRedeeming
					? "Redeeming..."
					: canAfford
						? `${creditsRequired} credits`
						: `Need ${creditsRequired - availableCredits} more`}
			</Button>
		</div>
	);
}
