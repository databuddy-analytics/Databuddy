"use client";

import { ChatTextIcon, ShoppingCartIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";
import { FeedbackCreditsCard } from "./components/feedback-credits-card";
import { FeedbackTable } from "./components/feedback-table";
import { RedeemDialog } from "./components/redeem-dialog";
import { ShopRewardCard } from "./components/shop-reward-card";
import { SubmitFeedbackDialog } from "./components/submit-feedback-dialog";

const REWARD_TIERS = [
	{ creditsRequired: 50, rewardType: "events", rewardAmount: 1000 },
	{ creditsRequired: 100, rewardType: "events", rewardAmount: 2500 },
	{ creditsRequired: 200, rewardType: "events", rewardAmount: 5000 },
	{ creditsRequired: 500, rewardType: "events", rewardAmount: 15_000 },
] as const;

export default function FeedbackPage() {
	const { data: balance, isLoading: isBalanceLoading } = useQuery(
		orpc.feedback.getCreditsBalance.queryOptions()
	);

	const [redeemTier, setRedeemTier] = useState<number | null>(null);

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<FeedbackCreditsCard
				available={balance?.available ?? 0}
				isLoading={isBalanceLoading}
				totalEarned={balance?.totalEarned ?? 0}
				totalSpent={balance?.totalSpent ?? 0}
			/>

			<Tabs defaultValue="feedback" variant="navigation">
				<TabsList>
					<TabsTrigger value="feedback">
						<ChatTextIcon size={16} weight="duotone" />
						Feedback
					</TabsTrigger>
					<TabsTrigger value="shop">
						<ShoppingCartIcon size={16} weight="duotone" />
						Shop
					</TabsTrigger>
				</TabsList>

				<TabsContent value="feedback">
					<div className="flex items-center justify-between border-b p-4">
						<div>
							<h2 className="text-balance font-semibold text-sm">
								My Feedback
							</h2>
							<p className="text-pretty text-muted-foreground text-xs">
								Submit feedback and earn credits when it gets approved
							</p>
						</div>
						<SubmitFeedbackDialog />
					</div>
					<FeedbackTable />
				</TabsContent>

				<TabsContent value="shop">
					<div className="border-b p-4">
						<h2 className="text-balance font-semibold text-sm">Credits Shop</h2>
						<p className="text-pretty text-muted-foreground text-xs">
							Exchange earned credits for extra event balance
						</p>
					</div>
					<div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
						{REWARD_TIERS.map((tier, index) => (
							<ShopRewardCard
								availableCredits={balance?.available ?? 0}
								creditsRequired={tier.creditsRequired}
								isRedeeming={redeemTier === index}
								key={tier.creditsRequired}
								onRedeemAction={() => setRedeemTier(index)}
								rewardAmount={tier.rewardAmount}
								rewardType={tier.rewardType}
							/>
						))}
					</div>
				</TabsContent>
			</Tabs>

			{redeemTier !== null && (
				<RedeemDialog
					creditsRequired={REWARD_TIERS[redeemTier].creditsRequired}
					onOpenChangeAction={(open) => {
						if (!open) setRedeemTier(null);
					}}
					open
					rewardAmount={REWARD_TIERS[redeemTier].rewardAmount}
					rewardType={REWARD_TIERS[redeemTier].rewardType}
					tierIndex={redeemTier}
				/>
			)}
		</main>
	);
}
