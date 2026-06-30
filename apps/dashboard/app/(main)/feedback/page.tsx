"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { FeedbackList } from "./components/feedback-list";
import { CreditsPanel } from "./components/credits-panel";
import { RedeemDialog } from "./components/redeem-dialog";
import { SubmitFeedbackDialog } from "./components/submit-feedback-dialog";

const REWARD_TIERS = [
	{ creditsRequired: 50, rewardType: "events", rewardAmount: 1000 },
	{ creditsRequired: 100, rewardType: "events", rewardAmount: 2500 },
	{ creditsRequired: 200, rewardType: "events", rewardAmount: 5000 },
	{ creditsRequired: 500, rewardType: "events", rewardAmount: 15_000 },
	{ creditsRequired: 25, rewardType: "agent-credits", rewardAmount: 10 },
	{ creditsRequired: 75, rewardType: "agent-credits", rewardAmount: 35 },
	{ creditsRequired: 150, rewardType: "agent-credits", rewardAmount: 80 },
	{ creditsRequired: 400, rewardType: "agent-credits", rewardAmount: 250 },
] as const;

const EVENT_TIERS = REWARD_TIERS.filter((t) => t.rewardType === "events");
const AGENT_TIERS = REWARD_TIERS.filter(
	(t) => t.rewardType === "agent-credits"
);

export default function FeedbackPage() {
	const { data: balance, isLoading: isBalanceLoading } = useQuery(
		orpc.feedback.getCreditsBalance.queryOptions()
	);

	const [redeemTier, setRedeemTier] = useState<number | null>(null);

	return (
		<div className="flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Feedback</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<SubmitFeedbackDialog />
			</TopBar.Actions>

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
					<FeedbackList />

					<div className="lg:sticky lg:top-4 lg:self-start">
						<CreditsPanel
							agentTiers={AGENT_TIERS}
							available={balance?.available ?? 0}
							eventTiers={EVENT_TIERS}
							isLoading={isBalanceLoading}
							onRedeemAction={setRedeemTier}
							redeemingTier={redeemTier}
							totalEarned={balance?.totalEarned ?? 0}
							totalSpent={balance?.totalSpent ?? 0}
						/>
					</div>
				</div>
			</div>

			{redeemTier !== null && (
				<RedeemDialog
					creditsRequired={REWARD_TIERS[redeemTier].creditsRequired}
					onOpenChangeAction={(open) => {
						if (!open) {
							setRedeemTier(null);
						}
					}}
					open
					rewardAmount={REWARD_TIERS[redeemTier].rewardAmount}
					rewardType={REWARD_TIERS[redeemTier].rewardType}
					tierIndex={redeemTier}
				/>
			)}
		</div>
	);
}
