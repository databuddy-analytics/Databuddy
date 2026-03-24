"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { orpc } from "@/lib/orpc";

interface RedeemDialogProps {
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
	tierIndex: number;
	creditsRequired: number;
	rewardAmount: number;
	rewardType: string;
}

export function RedeemDialog({
	open,
	onOpenChangeAction,
	tierIndex,
	creditsRequired,
	rewardAmount,
	rewardType,
}: RedeemDialogProps) {
	const queryClient = useQueryClient();

	const redeemMutation = useMutation({
		...orpc.feedback.redeemCredits.mutationOptions(),
		onSuccess: (result) => {
			toast.success(
				`Redeemed ${result.rewardAmount.toLocaleString()} ${result.rewardType}! ${result.remainingCredits} credits remaining.`
			);
			queryClient.invalidateQueries({
				queryKey: orpc.feedback.getCreditsBalance.queryOptions().queryKey,
			});
			onOpenChangeAction(false);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to redeem credits");
		},
	});

	return (
		<Dialog onOpenChange={onOpenChangeAction} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirm Redemption</DialogTitle>
					<DialogDescription>
						This will deduct credits from your balance and add events to your
						account.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<div className="flex items-center justify-between rounded border bg-secondary/50 px-4 py-3">
						<span className="text-muted-foreground text-sm">Credits spent</span>
						<span className="font-semibold tabular-nums">
							{creditsRequired}
						</span>
					</div>
					<div className="flex justify-center">
						<ArrowDownIcon
							className="text-muted-foreground"
							size={14}
							weight="fill"
						/>
					</div>
					<div className="flex items-center justify-between rounded border bg-secondary/50 px-4 py-3">
						<span className="text-muted-foreground text-sm">Events added</span>
						<span className="font-semibold text-green-600 tabular-nums dark:text-green-400">
							+{rewardAmount.toLocaleString()} {rewardType}
						</span>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={() => onOpenChangeAction(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={redeemMutation.isPending}
						onClick={() => redeemMutation.mutate({ tierIndex })}
						type="button"
					>
						{redeemMutation.isPending ? "Redeeming..." : "Confirm Redemption"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
