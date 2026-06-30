"use client";

import {
	LightningIcon,
	RobotIcon,
	TrendUpIcon,
	CreditCardIcon,
} from "@databuddy/ui/icons";
import { Button, Card, Skeleton } from "@databuddy/ui";
import { cn } from "@/lib/utils";

interface RewardTier {
	creditsRequired: number;
	rewardAmount: number;
	rewardType: string;
}

interface CreditsPanelProps {
	agentTiers: readonly RewardTier[];
	available: number;
	eventTiers: readonly RewardTier[];
	isLoading: boolean;
	onRedeemAction: (tierIndex: number) => void;
	redeemingTier: number | null;
	totalEarned: number;
	totalSpent: number;
}

const REWARD_LABELS: Record<string, string> = {
	events: "events",
	"agent-credits": "agent credits",
};

const REWARD_ICONS: Record<string, typeof LightningIcon> = {
	events: LightningIcon,
	"agent-credits": RobotIcon,
};

function getNextTier(available: number, tiers: readonly RewardTier[]) {
	return tiers
		.toSorted((a, b) => a.creditsRequired - b.creditsRequired)
		.find((tier) => tier.creditsRequired > available);
}

function TierRow({
	tier,
	tierIndex,
	available,
	redeemingTier,
	onRedeem,
}: {
	available: number;
	onRedeem: (index: number) => void;
	redeemingTier: number | null;
	tier: RewardTier;
	tierIndex: number;
}) {
	const canAfford = available >= tier.creditsRequired;
	const Icon = REWARD_ICONS[tier.rewardType] ?? LightningIcon;
	const rewardLabel = REWARD_LABELS[tier.rewardType] ?? tier.rewardType;
	const remaining = Math.max(tier.creditsRequired - available, 0);

	return (
		<div
			className={cn(
				"grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded border border-sidebar-border/50 bg-background/30 px-3 py-2.5 transition-colors",
				canAfford ? "hover:bg-sidebar-accent/45" : "opacity-60 hover:opacity-75"
			)}
		>
			<div className="flex size-8 items-center justify-center rounded bg-sidebar-accent/65 text-sidebar-foreground/60">
				<Icon className="size-4" />
			</div>

			<div className="min-w-0">
				<p className="truncate font-semibold text-foreground text-sm tabular-nums">
					{tier.rewardAmount.toLocaleString()} {rewardLabel}
				</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{canAfford
						? `${tier.creditsRequired.toLocaleString()} credits`
						: `${remaining.toLocaleString()} credits short`}
				</p>
			</div>

			<Button
				className="h-7 px-2.5 text-xs"
				disabled={!canAfford || redeemingTier === tierIndex}
				loading={redeemingTier === tierIndex}
				onClick={() => onRedeem(tierIndex)}
				size="sm"
				variant={canAfford ? "primary" : "secondary"}
			>
				{canAfford ? "Redeem" : tier.creditsRequired.toLocaleString()}
			</Button>
		</div>
	);
}

function BalanceSkeleton() {
	return (
		<Card className="border-sidebar-border/60 bg-sidebar">
			<div className="space-y-4 p-4">
				<div className="space-y-2">
					<Skeleton className="h-3 w-24 rounded" />
					<Skeleton className="h-10 w-28 rounded" />
				</div>
				<Skeleton className="h-2 w-full rounded" />
			</div>
			<div className="space-y-2 border-sidebar-border/50 border-t p-4">
				<Skeleton className="h-3 w-24 rounded" />
				<Skeleton className="h-14 w-full rounded" />
				<Skeleton className="h-14 w-full rounded" />
				<Skeleton className="h-14 w-full rounded" />
			</div>
		</Card>
	);
}

function RewardSection({
	available,
	baseIndex,
	onRedeemAction,
	redeemingTier,
	title,
	tiers,
}: {
	available: number;
	baseIndex: number;
	onRedeemAction: (tierIndex: number) => void;
	redeemingTier: number | null;
	title: string;
	tiers: readonly RewardTier[];
}) {
	return (
		<div className="border-sidebar-border/50 border-t p-4">
			<p className="mb-3 font-semibold text-muted-foreground text-xs uppercase">
				{title}
			</p>
			<div className="space-y-2">
				{tiers.map((tier, i) => (
					<TierRow
						available={available}
						key={`${tier.rewardType}:${tier.creditsRequired}`}
						onRedeem={onRedeemAction}
						redeemingTier={redeemingTier}
						tier={tier}
						tierIndex={baseIndex + i}
					/>
				))}
			</div>
		</div>
	);
}

export function CreditsPanel({
	available,
	totalEarned,
	totalSpent,
	isLoading,
	eventTiers,
	agentTiers,
	onRedeemAction,
	redeemingTier,
}: CreditsPanelProps) {
	if (isLoading) {
		return <BalanceSkeleton />;
	}

	const allTiers = [...eventTiers, ...agentTiers];
	const nextTier = getNextTier(available, allTiers);
	const progressMax = nextTier?.creditsRequired ?? Math.max(available, 1);
	const progress = Math.min((available / progressMax) * 100, 100);

	return (
		<Card className="border-sidebar-border/60 bg-sidebar">
			<div className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="font-semibold text-muted-foreground text-xs uppercase">
							Available credits
						</p>
						<p className="mt-1 font-semibold text-4xl text-foreground tabular-nums tracking-tight">
							{available.toLocaleString()}
						</p>
					</div>
					<div className="flex size-10 shrink-0 items-center justify-center rounded bg-sidebar-accent text-sidebar-foreground/65">
						<CreditCardIcon className="size-5" />
					</div>
				</div>

				<div className="mt-4 space-y-2">
					<div className="h-2 overflow-hidden rounded bg-sidebar-accent/70">
						<div
							className="h-full rounded bg-primary transition-[width]"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						{nextTier
							? `${Math.max(nextTier.creditsRequired - available, 0).toLocaleString()} credits to next redemption`
							: "All rewards are available"}
					</p>
				</div>

				<div className="mt-4 grid grid-cols-2 gap-2">
					<div className="rounded border border-sidebar-border/50 bg-background/30 px-3 py-2">
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<TrendUpIcon className="size-3.5 shrink-0 text-success" />
							Earned
						</div>
						<p className="mt-1 font-semibold text-sm tabular-nums">
							{totalEarned.toLocaleString()}
						</p>
					</div>
					<div className="rounded border border-sidebar-border/50 bg-background/30 px-3 py-2">
						<p className="text-muted-foreground text-xs">Spent</p>
						<p className="mt-1 font-semibold text-sm tabular-nums">
							{totalSpent.toLocaleString()}
						</p>
					</div>
				</div>
			</div>

			<RewardSection
				available={available}
				baseIndex={0}
				onRedeemAction={onRedeemAction}
				redeemingTier={redeemingTier}
				tiers={eventTiers}
				title="Event balance"
			/>

			<RewardSection
				available={available}
				baseIndex={eventTiers.length}
				onRedeemAction={onRedeemAction}
				redeemingTier={redeemingTier}
				tiers={agentTiers}
				title="Agent credits"
			/>
		</Card>
	);
}
